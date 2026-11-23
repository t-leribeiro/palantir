// T003: leitura das linhas exportadas pelo WhatsApp (RF-02 a RF-05, RF-12; RN-03, RN-04, RN-05).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ImportFormatError, parseExport, type ParseResult } from "../../../src/channels/whatsapp-export/parse.js";

const fixture = (name: string) =>
  readFileSync(new URL(`../../fixtures/whatsapp-export/${name}`, import.meta.url), "utf8").split("\n");

const summary = (r: ParseResult) =>
  r.messages.map((m) => `${m.local.day}/${m.local.month}/${m.local.year} ${m.local.hour}:${m.local.minute} ${m.author}: ${m.text}`);

describe("Android pt-BR", () => {
  const result = parseExport(fixture("android-pt-br.txt"));

  it("lê mensagens de texto com autor, data e hora", () => {
    expect(summary(result)).toEqual([
      "10/11/2026 10:0 Diego: Recomendo o Temporal para orquestrar workflows de longa duração",
      "10/11/2026 10:1 Ana: Concordo. Usamos em produção:\n- retries automáticos\n- histórico de execução",
      "10/11/2026 10:2 Ana: ok",
      "10/11/2026 10:2 Ana: ok",
      "11/11/2026 8:30 +55 11 98888-7777: Alguém testou o Karpenter no EKS?",
    ]);
  });

  it("ignora sistema (criptografia, entrada, mensagem apagada) e conta as mídias", () => {
    expect(result.systemCount).toBe(3);
    expect(result.mediaCount).toBe(2);
    expect(result.unrecognizedLines).toBe(0);
    expect(result.dateOrder).toBe("dmy");
  });
});

describe("Android en", () => {
  const result = parseExport(fixture("android-en.txt"));

  it("detecta mês/dia, converte 12h para 24h e junta multilinha", () => {
    expect(result.dateOrder).toBe("mdy");
    expect(summary(result)).toEqual([
      "10/11/2026 10:0 Diego: I recommend Temporal for long running workflows",
      "23/11/2026 13:15 Ana: Karpenter cut our cluster cost\nby thirty percent",
    ]);
    expect(result.systemCount).toBe(2);
    expect(result.mediaCount).toBe(1);
  });
});

describe("iOS pt-BR", () => {
  const result = parseExport(fixture("ios-pt-br.txt"));

  it("lê colchetes, segundos e ignora marcas invisíveis", () => {
    expect(summary(result)).toEqual([
      "10/11/2026 10:0 Diego: Recomendo o Temporal para workflows longos",
      "10/11/2026 10:1 Ana: Primeira linha\nsegunda linha",
    ]);
    expect(result.messages[0]?.local.second).toBe(15);
    expect(result.systemCount).toBe(2);
    expect(result.mediaCount).toBe(1);
  });
});

describe("iOS en", () => {
  it("lê o formato e conta o anexo", () => {
    const result = parseExport(fixture("ios-en.txt"));
    expect(summary(result)).toEqual(["10/11/2026 10:0 Diego: I recommend Temporal"]);
    expect(result.systemCount).toBe(1);
    expect(result.mediaCount).toBe(1);
    expect(result.dateOrder).toBe("mdy");
  });
});

describe("ordem de data e formatos inválidos", () => {
  it("recusa datas ambíguas em 12h sem a opção", () => {
    expect(() => parseExport(fixture("ambiguous-en.txt"))).toThrow(
      expect.objectContaining({ code: "ambiguous_date" }) as unknown as Error,
    );
  });

  it("aceita datas ambíguas com --formato-data", () => {
    const result = parseExport(fixture("ambiguous-en.txt"), { dateOrder: "mdy" });
    expect(summary(result)).toEqual(["10/11/2026 10:0 Diego: first", "11/10/2026 10:1 Ana: second"]);
  });

  it("recusa arquivo que não é exportação do WhatsApp e mostra só o padrão", () => {
    try {
      parseExport(fixture("not-whatsapp.txt"));
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ImportFormatError);
      expect((error as ImportFormatError).code).toBe("unrecognized_format");
      expect((error as ImportFormatError).message).not.toContain("compras");
      expect((error as ImportFormatError).message).toContain("Aaaaa");
    }
  });

  it("recusa quando mais de 5% das linhas não são reconhecidas", () => {
    const lines = ["10/11/2026 10:00 - Ana: a", ...Array.from({ length: 30 }, () => "lixo solto"), "10/11/2026 10:01 - Ana: b"];
    // lixo depois de uma mensagem é continuação (multilinha); antes da primeira, não é reconhecido
    const before = [...Array.from({ length: 3 }, () => "lixo antes"), ...Array.from({ length: 20 }, (_, i) => `10/11/2026 10:${String(i).padStart(2, "0")} - Ana: m${i}`)];
    expect(parseExport(lines).messages).toHaveLength(2);
    expect(() => parseExport(before)).toThrow(expect.objectContaining({ code: "unrecognized_format" }) as unknown as Error);
  });

  it("aceita BOM e quebra de linha CRLF", () => {
    const result = parseExport(["\uFEFF10/11/2026 10:00 - Ana: oi\r", "10/11/2026 10:01 - Bia: olá\r"]);
    expect(summary(result)).toEqual(["10/11/2026 10:0 Ana: oi", "10/11/2026 10:1 Bia: olá"]);
  });
});
