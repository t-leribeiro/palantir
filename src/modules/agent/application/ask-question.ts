import type { AgentReply, CanonicalMessage } from "../../../contracts/channel/knowledge-channel.js";
import type { Evidence } from "../../retrieval/index.js";
import { composeAnswer, noEvidenceReply, notLinkedReply, validateCitations } from "../domain/answer.js";
import { helpReply, isHelpRequest, isTextual, textOnlyReply } from "../domain/help.js";

/** Porta de geração de resposta (ADR-0007). A feature do agente adiciona uma implementação com LLM. */
export interface AnswerGenerator {
  generate(question: string, evidences: readonly Evidence[]): Promise<AgentReply>;
}

export interface IdentityResolver {
  resolve(provider: string, externalAccountId: string): Promise<{ userId: string; spaceId: string } | null>;
}

export interface EvidenceSearch {
  search(request: { spaceId: string; query: string }): Promise<{ results: readonly Evidence[]; lowConfidence: boolean }>;
}

/**
 * O que fazer com remetente sem conta ativa (feature 003, RF-05): `reply` orienta o vínculo (canal de teste);
 * `silent` não responde nada (WhatsApp: não revela o robô e reduz o risco de bloqueio).
 */
export type UnknownSenderPolicy = "reply" | "silent";

export interface AskQuestionDeps {
  readonly identity: IdentityResolver;
  readonly search: EvidenceSearch;
  readonly generator: AnswerGenerator;
  readonly unknownSender?: UnknownSenderPolicy;
}

/** `null` = o canal não envia nada. */
export type AskQuestion = (message: CanonicalMessage) => Promise<AgentReply | null>;

export function createDeterministicAnswerGenerator(): AnswerGenerator {
  return { generate: async (_question, evidences) => composeAnswer(evidences) };
}

/** RF-13: identidade antes de qualquer ferramenta, resposta só com evidências e citações conferidas. */
export function createAskQuestion(deps: AskQuestionDeps): AskQuestion {
  return async (message) => {
    const user = await deps.identity.resolve(message.source.provider, message.sender.externalId);
    if (!user) return deps.unknownSender === "silent" ? null : notLinkedReply();
    if (!isTextual(message.kind)) return textOnlyReply();
    const question = message.text?.trim() ?? "";
    if (question === "") return noEvidenceReply();
    if (isHelpRequest(question)) return helpReply();
    const { results, lowConfidence } = await deps.search.search({ spaceId: user.spaceId, query: question });
    if (lowConfidence || results.length === 0) return noEvidenceReply();
    return answerWithValidCitations(deps.generator, question, results);
  };
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
