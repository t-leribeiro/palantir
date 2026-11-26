import type { AgentReply, CanonicalMessage } from "../../../contracts/channel/knowledge-channel.js";
import type { Evidence } from "../../retrieval/index.js";
import type { AccountResolution, VerifyOutcome } from "../../identity/index.js";
import { composeAnswer, noAudioEvidenceReply, noEvidenceReply, notLinkedReply, validateCitations } from "../domain/answer.js";
import { parseVerificationCode } from "../domain/command.js";
import { helpReply, isHelpRequest, isTextual, textOnlyReply } from "../domain/help.js";
import { MANAGEMENT_TEXT as T, info } from "../domain/management-replies.js";
import { questionScope, type CatalogEntry } from "../domain/question.js";
import { parseShowSource } from "../domain/show-source.js";
import type { CitationStore } from "./conversation-state.js";
import type { ManageSources } from "./manage-sources.js";
import type { ShowSource } from "./show-source.js";

/** Porta de geração de resposta (ADR-0007). A feature do agente adiciona uma implementação com LLM. */
export interface AnswerGenerator {
  generate(question: string, evidences: readonly Evidence[]): Promise<AgentReply>;
}

export interface IdentityResolver {
  resolve(provider: string, externalAccountId: string): Promise<{ userId: string; spaceId: string } | null>;
}

export interface EvidenceSearch {
  search(request: { spaceId: string; query: string; kind?: "audio"; sourceIds?: readonly string[] }): Promise<{ results: readonly Evidence[]; lowConfidence: boolean }>;
}

/**
 * O que fazer com remetente sem conta ativa (feature 003, RF-05): `reply` orienta o vínculo (canal de teste);
 * `silent` não responde nada (WhatsApp: não revela o robô e reduz o risco de bloqueio).
 */
export type UnknownSenderPolicy = "reply" | "silent";

/**
 * Conta do remetente com o estado e a conferência do código (feature 006, RN-02, D-11, D-20). Com ela, a conta
 * `pending` só pode mandar o código; sem ela, vale a resolução antiga (só contas ativas).
 */
export interface AccountGate {
  resolve(provider: string, externalAccountId: string): Promise<AccountResolution | null>;
  verify(accountId: string, code: string): Promise<VerifyOutcome>;
}

export interface AskQuestionDeps {
  readonly identity: IdentityResolver;
  readonly search: EvidenceSearch;
  readonly generator: AnswerGenerator;
  readonly unknownSender?: UnknownSenderPolicy;
  readonly accounts?: AccountGate;
  /** Comandos de gestão de fontes (feature 006); sem eles, toda mensagem é pergunta. */
  readonly manage?: ManageSources;
  /** Nomes das conversas do espaço, para o filtro por grupo na pergunta (feature 006, RN-11). */
  readonly catalog?: (spaceId: string) => Promise<readonly CatalogEntry[]>;
  /** "mostra a N" (feature 008): onde ficam as citações da última resposta e o serviço que mostra a original. */
  readonly showSource?: { readonly citations: CitationStore; readonly show: ShowSource };
}

type Sender =
  | { readonly kind: "unknown" }
  | { readonly kind: "pending"; readonly accountId: string }
  | { readonly kind: "active"; readonly userId: string; readonly spaceId: string };

async function senderOf(deps: AskQuestionDeps, provider: string, externalId: string): Promise<Sender> {
  if (!deps.accounts) {
    const user = await deps.identity.resolve(provider, externalId);
    return user ? { kind: "active", ...user } : { kind: "unknown" };
  }
  const account = await deps.accounts.resolve(provider, externalId);
  if (!account) return { kind: "unknown" };
  return account.status === "active" ? { kind: "active", userId: account.userId, spaceId: account.spaceId } : { kind: "pending", accountId: account.accountId };
}

/** Conta pendente: só o código de 6 dígitos é aceito; o resto recebe a instrução (RN-02). */
async function verificationReply(accounts: AccountGate, accountId: string, text: string): Promise<AgentReply> {
  const code = parseVerificationCode(text);
  if (!code) return info(T.pendingAccount);
  const outcome = await accounts.verify(accountId, code);
  if (outcome.kind === "verified") return info(T.verified);
  if (outcome.kind === "wrong") return info(T.wrongCode(outcome.remaining));
  return info(outcome.kind === "locked" ? T.lockedCode : T.expiredCode);
}

/** `null` = o canal não envia nada. */
export type AskQuestion = (message: CanonicalMessage) => Promise<AgentReply | null>;

export function createDeterministicAnswerGenerator(): AnswerGenerator {
  return { generate: async (_question, evidences) => composeAnswer(evidences) };
}

/** RF-13: identidade antes de qualquer ferramenta, resposta só com evidências e citações conferidas. */
export function createAskQuestion(deps: AskQuestionDeps): AskQuestion {
  return async (message) => {
    const sender = await senderOf(deps, message.source.provider, message.sender.externalId);
    if (sender.kind === "unknown") return deps.unknownSender === "silent" ? null : notLinkedReply();
    if (!isTextual(message.kind)) return textOnlyReply();
    const question = message.text?.trim() ?? "";
    if (sender.kind === "pending") return deps.accounts ? verificationReply(deps.accounts, sender.accountId, question) : null;
    return answerActive(deps, { ...sender, provider: message.source.provider, accountId: message.sender.externalId }, question);
  };
}

type ActiveContext = { readonly userId: string; readonly spaceId: string; readonly provider: string; readonly accountId: string };

/** Conta ativa e verificada: comando de gestão, "mostra a N", ajuda ou pergunta, nessa ordem. */
async function answerActive(deps: AskQuestionDeps, ctx: ActiveContext, question: string): Promise<AgentReply> {
  if (question === "") return noEvidenceReply();
  const managed = await deps.manage?.(ctx, question);
  if (managed) return managed;
  const index = deps.showSource ? parseShowSource(question) : null;
  if (index !== null && deps.showSource) return deps.showSource.show(ctx, index);
  if (isHelpRequest(question)) return helpReply();
  const results = await searchInScope(deps, ctx.spaceId, question);
  if ("outcome" in results) return results;
  return remember(deps, ctx, await answerWithValidCitations(deps.generator, question, results));
}

/** Feature 008 (D-02, D-03): só resposta com citações troca a lista, e só com ids e a faixa do trecho. */
async function remember(deps: AskQuestionDeps, ctx: ActiveContext, reply: AgentReply): Promise<AgentReply> {
  if (!deps.showSource || reply.outcome !== "answered" || reply.citations.length === 0) return reply;
  const items = reply.citations.map((c) => ({
    index: c.index,
    messageId: c.messageId,
    kind: c.kind ?? "text",
    ...(c.audioStartS !== undefined && c.audioEndS !== undefined ? { audioStartS: c.audioStartS, audioEndS: c.audioEndS } : {}),
  }));
  await deps.showSource.citations.saveCitations(ctx.userId, ctx.provider, { items, at: new Date() });
  return reply;
}

/**
 * Busca no escopo da pergunta: "em qual áudio..." só entre áudios (E001) e o nome de uma conversa só nela (RN-11).
 * Sem evidência, ou com nome de conversa repetido, já devolve a resposta.
 */
async function searchInScope(deps: AskQuestionDeps, spaceId: string, question: string): Promise<readonly Evidence[] | AgentReply> {
  const scope = questionScope(question, deps.catalog ? await deps.catalog(spaceId) : []);
  if (scope.ambiguousTitle) return info(T.ambiguousTitle(scope.ambiguousTitle));
  const { results, lowConfidence } = await deps.search.search({
    spaceId,
    query: scope.query,
    ...(scope.onlyAudio ? { kind: "audio" as const } : {}),
    ...(scope.sourceIds ? { sourceIds: scope.sourceIds } : {}),
  });
  if (lowConfidence || results.length === 0) return scope.onlyAudio ? noAudioEvidenceReply() : noEvidenceReply();
  return results;
}

const MAX_ATTEMPTS = 2;

async function answerWithValidCitations(
  generator: AnswerGenerator,
  question: string,
  results: readonly Evidence[],
): Promise<AgentReply> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const reply = await generator.generate(question, results);
    if (reply.outcome !== "answered") return reply;
    if (validateCitations(reply.citations, results, reply.outcome)) return reply;
  }
  return noEvidenceReply();
}
