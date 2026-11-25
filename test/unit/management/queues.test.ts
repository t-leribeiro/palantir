// T002 (feature 006): filas da exclusão e do aviso (interfaces/jobs-exclusao-e-aviso.md).
import { describe, expect, it } from "vitest";
import { QUEUES } from "../../../src/main/compose.js";
import { AGENT_NOTIFY_QUEUE_DEFINITIONS, SOURCE_DELETE_QUEUE_DEFINITION } from "../../../src/main/management.js";
import { AGENT_NOTIFY_QUEUE } from "../../../src/modules/agent/index.js";
import { DELETION_NOTICE_QUEUE, noticeQueueFor } from "../../../src/modules/sources/index.js";

describe("filas da gestão de fontes", () => {
  it("sources.delete tenta por mais de 24 h antes da fila morta (EC-03)", () => {
    const { retryLimit, retryDelaySeconds, deadLetter } = SOURCE_DELETE_QUEUE_DEFINITION;
    const total = Array.from({ length: retryLimit }, (_, i) => retryDelaySeconds * 2 ** i).reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(24 * 3600);
    expect(deadLetter).toBe("sources.delete.dead");
  });

  it("um aviso por canal, com o mesmo nome-base nos módulos do agente e de fontes", () => {
    expect(DELETION_NOTICE_QUEUE).toBe(AGENT_NOTIFY_QUEUE);
    expect(AGENT_NOTIFY_QUEUE_DEFINITIONS.map((q) => q.name)).toEqual(["agent.notify.whatsapp", "agent.notify.fake"]);
    expect(noticeQueueFor(AGENT_NOTIFY_QUEUE, "fake")).toBe("agent.notify.fake");
    expect(AGENT_NOTIFY_QUEUE_DEFINITIONS[0]).toMatchObject({ retryLimit: 5, expireInSeconds: 120 });
  });

  it("as filas fazem parte da composição", () => {
    const names = QUEUES.map((q) => q.name);
    expect(names).toContain(SOURCE_DELETE_QUEUE_DEFINITION.name);
    for (const q of AGENT_NOTIFY_QUEUE_DEFINITIONS) expect(names).toContain(q.name);
  });
});
