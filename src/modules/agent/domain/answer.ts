import type { AgentReply, Citation } from "../../../contracts/channel/knowledge-channel.js";
import type { Evidence } from "../../retrieval/index.js";

export const NO_EVIDENCE_TEXT = "Não encontrei evidências suficientes.";
export const NOT_LINKED_TEXT =
  "Não encontrei uma conta vinculada a este número. Para consultar sua memória, vincule esta conta ao Palantír primeiro.";
export const MAX_CITATIONS = 3;
const SNIPPET_CHARS = 280;
const TIME_ZONE = "America/Sao_Paulo";

export const noEvidenceReply = (): AgentReply => ({ text: NO_EVIDENCE_TEXT, outcome: "no_evidence", citations: [] });

export const notLinkedReply = (): AgentReply => ({ text: NOT_LINKED_TEXT, outcome: "no_evidence", citations: [] });

/** RN-04: toda citação aponta para uma mensagem que veio da busca; "answered" exige citação. */
export function validateCitations(
  citations: readonly Pick<Citation, "messageId">[],
  evidences: readonly Pick<Evidence, "messageId">[],
  outcome: AgentReply["outcome"] = "answered",
): boolean {
  if (outcome === "answered" && citations.length === 0) return false;
  const known = new Set(evidences.map((e) => e.messageId));
  return citations.every((c) => known.has(c.messageId));
}

/** Compositor determinístico (ADR-0007): lista até 3 evidências com autor, fonte e data. */
export function composeAnswer(evidences: readonly Evidence[]): AgentReply {
  const used = evidences.slice(0, MAX_CITATIONS);
  if (used.length === 0) return noEvidenceReply();
  const citations: Citation[] = used.map((e, i) => ({
    index: i + 1,
    messageId: e.messageId,
    author: e.author,
    sourceTitle: e.sourceTitle,
    sentAt: e.sentAt.toISOString(),
  }));
  const lines = used.map((e, i) => `${i + 1}. ${e.author} em ${e.sourceTitle}, ${formatDate(e.sentAt)}: “${snippet(e.chunkText)}” [${i + 1}]`);
  const header = used.length === 1 ? "Encontrei 1 mensagem sobre isso:" : `Encontrei ${used.length} mensagens sobre isso:`;
  return { text: `${header}\n\n${lines.join("\n")}`, outcome: "answered", citations };
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: TIME_ZONE, day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

function snippet(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= SNIPPET_CHARS ? flat : `${flat.slice(0, SNIPPET_CHARS - 1)}…`;
}
