// Verificador externo de evidências com o Jev, da TypeSafe (feature 007, D-10; interfaces/verificador-externo.md).
// Uma requisição por pergunta: as candidatas vão juntas no `state` e cada uma ganha uma pergunta "noul" (probabilidade
// de sim). A documentação da TypeSafe recomenda juntar perguntas independentes sobre o mesmo estado. Só é montado com
// PALANTIR_VERIFIER_ALLOW_REMOTE=true: pergunta e trechos saem da máquina. Nada disso vai para log.
import type { EvidenceVerifier, VerifierCandidate } from "../../application/search-evidence.js";

export interface TypeSafeVerifierOptions {
  readonly apiKey: string;
  readonly model: string;
  readonly url?: string;
  readonly fetch?: typeof fetch;
}

export const TYPESAFE_VERIFIER = "typesafe";
const DEFAULT_URL = "https://api.typesafe.ai";

interface SystemOneResponse {
  readonly answers?: Readonly<Record<string, { readonly type?: string; readonly noul?: number }>>;
}

/** Corpo do `POST /v1/systemone`: o significado da pergunta fica fixo; o id interno da mensagem nunca vai. */
export function systemOneBody(model: string, question: string, candidates: readonly VerifierCandidate[]): object {
  const questions = Object.fromEntries(
    candidates.map((_, i) => [
      `c${i}`,
      {
        type: "noul",
        instructions: `A mensagem \`mensagens[${i}]\` responde ou sustenta diretamente a \`pergunta\`? Considere o assunto, não as palavras exatas.`,
        criteria: {
          true: "A mensagem trata do que a pergunta pede e serviria de fonte para respondê-la.",
          false: "A mensagem é de outro assunto, só parecido, ou não dá base para responder.",
        },
      },
    ]),
  );
  const mensagens = candidates.map((c) => ({ autor: c.author, conversa: c.sourceTitle, data: c.sentAt, texto: c.text }));
  return { model, state: { pergunta: question, mensagens }, questions };
}

export function createTypeSafeVerifier(options: TypeSafeVerifierOptions): EvidenceVerifier {
  const base = (options.url ?? DEFAULT_URL).replace(/\/+$/, "");
  const doFetch = options.fetch ?? fetch;
  return {
    provider: TYPESAFE_VERIFIER,
    async verify(question, candidates, signal) {
      if (candidates.length === 0) return new Map();
      const response = await doFetch(`${base}/v1/systemone`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${options.apiKey}` },
        body: JSON.stringify(systemOneBody(options.model, question, candidates)),
        signal,
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`verificador recusou (HTTP ${response.status})`);
      }
      const { answers = {} } = (await response.json()) as SystemOneResponse;
      const probabilities = new Map<string, number>();
      candidates.forEach((c, i) => {
        const p = answers[`c${i}`]?.noul;
        if (typeof p === "number" && Number.isFinite(p)) probabilities.set(c.id, p);
      });
      return probabilities;
    },
  };
}
