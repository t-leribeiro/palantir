// T008 (feature 006): saída do `whatsapp:link` com o código de verificação (interfaces/cli-vinculo-grupos-auditoria.md §1).
import { describe, expect, it } from "vitest";
import { formatLink } from "../../../src/main/whatsapp-link.js";

const base = { phone: "+5511988887777", importedSources: 2, accountId: "acc-1" } as const;

describe("formatLink", () => {
  it("mostra o número mascarado e o código em dois grupos de 3 dígitos", () => {
    const text = formatLink({ ...base, outcome: "linked", needsVerification: true, code: "482913", expiresAt: new Date() });
    expect(text).toContain("vinculado e aguardando verificação");
    expect(text).toContain("    482 913");
    expect(text).toContain("em até 10 minutos");
    expect(text).not.toContain("988887777");
    expect(text).toContain("Conversas importadas nesta conta: 2");
  });

  it("conta já verificada não mostra código", () => {
    const text = formatLink({ ...base, outcome: "unchanged", needsVerification: false });
    expect(text).toContain("já verificado, nada mudou");
    expect(text).not.toContain("código");
  });
});
