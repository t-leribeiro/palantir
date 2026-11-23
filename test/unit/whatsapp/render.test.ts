// T005: renderização para o WhatsApp (RF-08 da S2, D-11).
import { describe, expect, it } from "vitest";
import { renderForWhatsApp } from "../../../src/channels/whatsapp/render.js";
import type { AgentReply } from "../../../src/contracts/channel/knowledge-channel.js";

const reply = (text: string): AgentReply => ({ text, outcome: "no_evidence", citations: [] });

describe("renderForWhatsApp", () => {
  it("resposta curta sai numa parte só, sem numeração", () => {
    expect(renderForWhatsApp(reply("Não encontrei evidências suficientes."))).toEqual(["Não encontrei evidências suficientes."]);
  });

  it("converte **negrito** e __itálico__ para a marcação do WhatsApp", () => {
    expect(renderForWhatsApp(reply("**Diego** recomendou o __Temporal__"))).toEqual(["*Diego* recomendou o _Temporal_"]);
  });

  it("divide em partes numeradas de no máximo 4.000 caracteres sem cortar uma citação", () => {
    const citation = (i: number) => `${i}. Ana em Comunidade DevOps, 22/11/2026: “${"x".repeat(1400)}” [${i}]`;
    const text = ["Encontrei 6 mensagens sobre isso:", "", ...Array.from({ length: 6 }, (_, i) => citation(i + 1))].join("\n");
    expect(text.length).toBeGreaterThan(8500);
    const parts = renderForWhatsApp(reply(text));
    expect(parts).toHaveLength(3);
    parts.forEach((part, i) => {
      expect(part.length).toBeLessThanOrEqual(4000);
      expect(part.startsWith(`(${i + 1}/3)\n`)).toBe(true);
    });
    for (let i = 1; i <= 6; i += 1) {
      expect(parts.filter((p) => p.includes(citation(i)))).toHaveLength(1);
    }
  });

  it("respeita um limite menor informado", () => {
    const parts = renderForWhatsApp(reply(["a".repeat(30), "b".repeat(30)].join("\n")), 40);
    expect(parts).toEqual([`(1/2)\n${"a".repeat(30)}`, `(2/2)\n${"b".repeat(30)}`]);
  });
});
