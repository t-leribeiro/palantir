// T012 (feature 004, interfaces/cli-whatsapp-grupos.md): parser e saída do comando `whatsapp:grupos`.
import { describe, expect, it } from "vitest";
import { UsageError, formatListing, formatResult, parseGroupsArgs } from "../../../src/main/whatsapp-groups.js";
import type { GroupListing } from "../../../src/modules/sources/index.js";

describe("parseGroupsArgs", () => {
  it("sem argumentos, lista", () => {
    expect(parseGroupsArgs([])).toEqual({ action: "listar" });
    expect(parseGroupsArgs(["listar"])).toEqual({ action: "listar" });
  });

  it("autorizar com consentimento, conversa e dono padrão", () => {
    expect(parseGroupsArgs(["autorizar", "1", "--consentimento", "todos avisados", "--conversa", "T3"])).toEqual({
      action: "autorizar",
      group: "1",
      consent: "todos avisados",
      conversation: "T3",
      owner: { provider: "fake", accountId: "fake-operator" },
    });
  });

  it("autorizar sem consentimento chega ao caso de uso, que recusa com a mensagem certa", () => {
    expect(parseGroupsArgs(["autorizar", "2"])).toMatchObject({ action: "autorizar", group: "2", consent: "" });
  });

  it("dono informado, inclusive com ':' na conta", () => {
    expect(parseGroupsArgs(["autorizar", "1", "--consentimento", "x", "--dono", "whatsapp:+55:1"])).toMatchObject({
      owner: { provider: "whatsapp", accountId: "+55:1" },
    });
    expect(() => parseGroupsArgs(["autorizar", "1", "--dono", "sem-conta"])).toThrow(/provider:conta/);
  });

  it("revogar exige o grupo; ação desconhecida mostra o uso", () => {
    expect(parseGroupsArgs(["revogar", " 3 "])).toEqual({ action: "revogar", group: "3" });
    expect(() => parseGroupsArgs(["revogar"])).toThrow(UsageError);
    expect(() => parseGroupsArgs(["autorizar"])).toThrow(/uso:/);
    expect(() => parseGroupsArgs(["apagar", "1"])).toThrow(/uso:/);
  });
});

const listing: GroupListing = {
  updatedAt: new Date("2026-11-23T20:40:00Z"),
  groups: [
    {
      position: 1,
      groupId: "1@g.us",
      subject: "Comunidade DevOps",
      participants: 80,
      seenAt: new Date("2026-11-23T20:40:00Z"),
      leftAt: null,
      status: { kind: "revoked", at: new Date("2026-11-23T21:10:00Z") },
    },
    {
      position: 2,
      groupId: "2@g.us",
      subject: "Família",
      participants: 12,
      seenAt: new Date("2026-11-23T20:40:00Z"),
      leftAt: null,
      status: { kind: "not_authorized" },
    },
    {
      position: 3,
      groupId: "3@g.us",
      subject: "Grupo de teste Palantír",
      participants: 5,
      seenAt: new Date("2026-11-23T20:40:00Z"),
      leftAt: null,
      status: { kind: "authorized", sourceTitle: "T3", since: new Date("2026-11-23T20:42:00Z") },
    },
    {
      position: 4,
      groupId: "4@g.us",
      subject: "Antigo",
      participants: 3,
      seenAt: new Date("2026-11-20T10:00:00Z"),
      leftAt: new Date("2026-11-21T10:00:00Z"),
      status: { kind: "not_authorized" },
    },
  ],
};

describe("formatListing", () => {
  it("mostra posição, nome, participantes e status no horário de Brasília, sem ids de grupo", () => {
    const text = formatListing(listing);
    expect(text).toContain("Grupos do número de captura (atualizado em 23/11/2026 17:40):");
    expect(text).toMatch(/ 1\. Comunidade DevOps\s+80 participantes {3}revogado em 23\/11 18:10/);
    expect(text).toMatch(/ 2\. Família\s+12 participantes {3}não autorizado/);
    expect(text).toMatch(/ 3\. Grupo de teste Palantír\s+5 participantes {3}autorizado \(fonte "T3", desde 23\/11 17:42\)/);
    expect(text).toContain("o número saiu do grupo");
    expect(text).toContain("npm run whatsapp:grupos -- autorizar <número>");
    expect(text).not.toContain("@g.us");
  });

  it("diretório vazio: orienta a ligar a captura", () => {
    expect(formatListing({ updatedAt: null, groups: [] })).toBe(
      "Nenhum grupo conhecido. Ligue a captura e rode `npm run dev:whatsapp` para atualizar a lista.",
    );
  });
});

describe("formatResult", () => {
  it("autorização ligada à importação e fonte nova", () => {
    const at = new Date();
    expect(formatResult({ action: "autorizar", result: { subject: "Grupo de teste", sourceTitle: "T3", linkedToImport: true, authorizedAt: at } })).toBe(
      'Grupo "Grupo de teste" autorizado para captura (fonte "T3"). Mensagens novas a partir de agora.',
    );
    expect(
      formatResult({ action: "autorizar", result: { subject: "Grupo de teste", sourceTitle: "Grupo de teste", linkedToImport: false, authorizedAt: at } }),
    ).toContain('(fonte nova "Grupo de teste")');
  });

  it("revogação lembra que o que já foi guardado continua", () => {
    expect(formatResult({ action: "revogar", subject: "Grupo de teste" })).toBe(
      'Captura do grupo "Grupo de teste" revogada. As mensagens já guardadas continuam pesquisáveis (exclusão na S5).',
    );
  });
});
