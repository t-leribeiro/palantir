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

describe("formas vistas em export real (BUG-1 a BUG-5 de _reversa_bugs/importacao-whatsapp)", () => {
  const result = parseExport(fixture("android-pt-br-formas-reais.txt"));

  it("trecho colado em outro formato continua na mensagem de quem colou (BUG-1)", () => {
    expect(summary(result)[0]).toBe(
      "22/11/2026 9:1 Diego: Segue o que rolou na outra conversa:\n[20/11/2026 14:10] Bia Souza: Alguém viu o alerta do Kafka?\n[20/11/2026 14:12] Caio: Era o disco cheio no broker 2",
    );
    expect(result.messages.map((m) => m.author)).not.toContain("Bia Souza");
  });

  it("export do iOS com linha colada no formato do Android também não se divide (BUG-1)", () => {
    const ios = parseExport(["[10/11/2026, 10:00:15] Diego: veja:", "10/11/2026 09:00 - Ana: linha colada"]);
    expect(summary(ios)).toEqual(["10/11/2026 10:0 Diego: veja:\n10/11/2026 09:00 - Ana: linha colada"]);
  });

  it("ignora mensagem sem texto e \"Mensagem apagada\" como sistema (BUG-2, BUG-3)", () => {
    expect(result.messages.every((m) => m.text.trim() !== "")).toBe(true);
    expect(result.messages.map((m) => m.text)).not.toContain("Mensagem apagada");
    expect(result.systemCount).toBe(3);
    expect(result.mediaCount).toBe(1);
  });

  it("tira o marcador de edição do fim do texto (BUG-4)", () => {
    expect(summary(result)).toContain("22/11/2026 9:4 Ana: Corrigindo: o broker era o 3");
    expect(summary(parseExport(["10/11/2026 10:00 - Ana: fixed it <This message was edited>"]))).toEqual([
      "10/11/2026 10:0 Ana: fixed it",
    ]);
  });

  it("tira o prefixo ~ de quem não está na agenda (BUG-5)", () => {
    expect(summary(result).slice(2)).toEqual([
      "22/11/2026 9:5 Rafa: Valeu pela ajuda",
      "22/11/2026 9:6 +55 11 98888-7777: Alguém testou o Karpenter?",
    ]);
    expect(parseExport(["10/11/2026 10:00 - ~ Rafa: oi"]).messages[0]?.author).toBe("Rafa");
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

describe("legenda de anexo (BUG-6 de _reversa_bugs/importacao-whatsapp, BUG-20261123-S57G)", () => {
  it("anexo com legenda vira mensagem com a legenda, o autor e a data do anexo; continua contado como mídia", () => {
    const result = parseExport([
      "13/11/2026 10:00 - Ana: recibo.pdf (arquivo anexado)",
      "Recibo da psicóloga, novembro",
      "13/11/2026 10:01 - Bia: IMG-20261113-WA0001.jpg (arquivo anexado)",
      "13/11/2026 10:02 - Ana: comprovante.pdf (arquivo anexado)",
      "Luz de outubro",
      "pago no débito",
      "13/11/2026 10:03 - Bia: ok",
    ]);
    expect(summary(result)).toEqual([
      "13/11/2026 10:0 Ana: Recibo da psicóloga, novembro",
      "13/11/2026 10:2 Ana: Luz de outubro\npago no débito",
      "13/11/2026 10:3 Bia: ok",
    ]);
    expect(result.mediaCount).toBe(3);
    expect(result.systemCount).toBe(0);
  });

  it("vale para o export em inglês, para o iOS e para a mídia oculta", () => {
    const en = parseExport(["11/13/26, 10:00 AM - Ana: receipt.pdf (file attached)", "Therapist receipt"]);
    expect(en.messages.map((m) => m.text)).toEqual(["Therapist receipt"]);
    const ios = parseExport(["[13/11/2026, 10:00:00] Ana: ‎<anexado: 00000012-PHOTO-2026-11-13.jpg>", "Recibo da psicóloga"]);
    expect(ios.messages.map((m) => m.text)).toEqual(["Recibo da psicóloga"]);
    const hidden = parseExport(["13/11/2026 10:00 - Ana: <Mídia oculta>", "Recibo da psicóloga"]);
    expect(hidden.messages.map((m) => m.text)).toEqual(["Recibo da psicóloga"]);
  });

  it("legenda só com espaços não vira mensagem; marcador de edição sai da legenda", () => {
    const result = parseExport([
      "13/11/2026 10:00 - Ana: recibo.pdf (arquivo anexado)",
      "   ",
      "13/11/2026 10:01 - Ana: foto.jpg (arquivo anexado)",
      "Conta de água <Mensagem editada>",
    ]);
    expect(result.messages.map((m) => m.text)).toEqual(["Conta de água"]);
    expect(result.mediaCount).toBe(2);
  });
});
