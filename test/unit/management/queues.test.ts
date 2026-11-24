// T002 (feature 006): filas da exclusão e do aviso (interfaces/jobs-exclusao-e-aviso.md).
import { describe, expect, it } from "vitest";
import { AGENT_NOTIFY_QUEUE_DEFINITION, SOURCE_DELETE_QUEUE_DEFINITION } from "../../../src/main/management.js";
import { QUEUES } from "../../../src/main/compose.js";

describe("filas da gestão de fontes", () => {
  it("sources.delete tenta por mais de 24 h antes da fila morta (EC-03)", () => {
    const { retryLimit, retryDelaySeconds, deadLetter } = SOURCE_DELETE_QUEUE_DEFINITION;
    const total = Array.from({ length: retryLimit }, (_, i) => retryDelaySeconds * 2 ** i).reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(24 * 3600);
    expect(deadLetter).toBe("sources.delete.dead");
  });

  it("as duas filas fazem parte da composição", () => {
    const names = QUEUES.map((q) => q.name);
    expect(names).toContain(SOURCE_DELETE_QUEUE_DEFINITION.name);
    expect(names).toContain(AGENT_NOTIFY_QUEUE_DEFINITION.name);
    expect(AGENT_NOTIFY_QUEUE_DEFINITION).toMatchObject({ name: "agent.notify", retryLimit: 5 });
  });
});
