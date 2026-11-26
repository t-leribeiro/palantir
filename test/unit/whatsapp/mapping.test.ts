// T013: funções puras do provedor real (D-06, D-14, D-16, D-17).
import { describe, expect, it } from "vitest";
import { backoffMs, captionOf, classifyContent, contextOf, isGroupJid, isIgnoredJid, libraryErrorReason, lidFromJid, phoneFromJid, textOf } from "../../../src/channels/whatsapp/provider/mapping.js";

describe("phoneFromJid", () => {
  it("converte JID de número em E.164, inclusive com dispositivo e sem o nono dígito", () => {
    expect(phoneFromJid("5511988887777@s.whatsapp.net")).toBe("+5511988887777");
    expect(phoneFromJid("5511988887777:12@s.whatsapp.net")).toBe("+5511988887777");
    expect(phoneFromJid("551188887777@s.whatsapp.net")).toBe("+5511988887777");
  });

  it("não inventa número para LID, grupo ou vazio", () => {
    expect(phoneFromJid("123456789012345@lid")).toBeNull();
    expect(phoneFromJid("120363000000000000@g.us")).toBeNull();
    expect(phoneFromJid(undefined)).toBeNull();
    expect(phoneFromJid(null)).toBeNull();
  });
});

describe("isIgnoredJid", () => {
  it("ignora grupos, listas de transmissão, status e canais", () => {
    for (const jid of ["120363000000000000@g.us", "status@broadcast", "123@broadcast", "1203630000@newsletter"]) expect(isIgnoredJid(jid)).toBe(true);
  });

  it("aceita conversas 1:1 por número ou LID", () => {
    expect(isIgnoredJid("5511988887777@s.whatsapp.net")).toBe(false);
    expect(isIgnoredJid("123456789012345@lid")).toBe(false);
  });

  it("com a captura ligada, aceita grupos, mas nunca transmissões, status e canais (feature 004)", () => {
    expect(isIgnoredJid("120363000000000000@g.us", true)).toBe(false);
    expect(isIgnoredJid("5511988887777@s.whatsapp.net", true)).toBe(false);
    for (const jid of ["status@broadcast", "123@broadcast", "1203630000@newsletter"]) expect(isIgnoredJid(jid, true)).toBe(true);
  });
});

describe("isGroupJid e lidFromJid (feature 004, D-11)", () => {
  it("reconhece JID de grupo", () => {
    expect(isGroupJid("120363000000000000@g.us")).toBe(true);
    expect(isGroupJid("5511988887777@s.whatsapp.net")).toBe(false);
    expect(isGroupJid(undefined)).toBe(false);
    expect(isGroupJid(null)).toBe(false);
  });

  it("LID vira lid:<id>, com ou sem dispositivo; outros JIDs não", () => {
    expect(lidFromJid("123456789012345@lid")).toBe("lid:123456789012345");
    expect(lidFromJid("123456789012345:3@lid")).toBe("lid:123456789012345");
    expect(lidFromJid("5511988887777@s.whatsapp.net")).toBeNull();
    expect(lidFromJid("x@lid")).toBeNull();
    expect(lidFromJid(undefined)).toBeNull();
  });
});

describe("classifyContent e textOf", () => {
  it("reconhece texto simples e estendido", () => {
    expect(classifyContent({ conversation: "oi" })).toBe("text");
    expect(classifyContent({ extendedTextMessage: { text: "oi" }, messageContextInfo: {} })).toBe("text");
    expect(textOf({ conversation: "oi" })).toBe("oi");
    expect(textOf({ extendedTextMessage: { text: "olá" } })).toBe("olá");
  });

  it("reconhece mídias", () => {
    expect(classifyContent({ audioMessage: {} })).toBe("audio");
    expect(classifyContent({ imageMessage: {} })).toBe("image");
    expect(classifyContent({ documentWithCaptionMessage: {} })).toBe("document");
    expect(classifyContent({ videoMessage: {} })).toBe("video");
    expect(classifyContent({ stickerMessage: {} })).toBe("sticker");
    expect(classifyContent({ contactMessage: {} })).toBe("other");
  });

  it("ignora reações, mensagens de protocolo e conteúdo vazio", () => {
    expect(classifyContent({ reactionMessage: {} })).toBe("ignore");
    expect(classifyContent({ protocolMessage: {} })).toBe("ignore");
    expect(classifyContent({ senderKeyDistributionMessage: {} })).toBe("ignore");
    expect(classifyContent({})).toBe("ignore");
    expect(classifyContent(undefined)).toBe("ignore");
    expect(classifyContent({ conversation: "" })).toBe("ignore");
  });
});

describe("backoffMs", () => {
  it("cresce de 1 s até o teto de 60 s, com variação de até 20%", () => {
    const exact = (attempt: number) => backoffMs(attempt, () => 0.5);
    expect([0, 1, 2, 3, 4, 5, 6, 10].map(exact)).toEqual([1000, 2000, 4000, 8000, 16000, 32000, 60000, 60000]);
    expect(backoffMs(2, () => 0)).toBe(3200);
    expect(backoffMs(2, () => 1)).toBe(4800);
    expect(backoffMs(9, () => 1)).toBe(60000);
  });
});

describe("libraryErrorReason (diagnóstico sem conteúdo)", () => {
  it("pega só nome e mensagem do erro, em err, error ou no próprio objeto", () => {
    const err = new Error("No SenderKeyRecord found for decryption");
    expect(libraryErrorReason({ key: { remoteJid: "5511999998888@s.whatsapp.net" }, err })).toBe("Error: No SenderKeyRecord found for decryption");
    expect(libraryErrorReason({ error: new TypeError("Bad MAC") })).toBe("TypeError: Bad MAC");
    expect(libraryErrorReason(new Error("x"))).toBe("Error: x");
  });

  it("mascara números longos, corta em 80 caracteres e ignora o que não é erro", () => {
    expect(libraryErrorReason({ err: new Error("sem sessão para 5511999998888.0") })).toBe("Error: sem sessão para #.0");
    expect(libraryErrorReason({ err: new Error("a".repeat(200)) })?.length).toBe(80);
    expect(libraryErrorReason({ key: {}, text: "mensagem secreta" })).toBeUndefined();
    expect(libraryErrorReason(null)).toBeUndefined();
  });
});

describe("contextOf e captionOf (feature 009, D-02)", () => {
  it("lê encaminhado e citada do contextInfo do tipo, inclusive no documento embrulhado", () => {
    expect(contextOf({ extendedTextMessage: { text: "x", contextInfo: { isForwarded: true, stanzaId: "ABC" } } })).toEqual({ isForwarded: true, quotedId: "ABC" });
    expect(contextOf({ documentWithCaptionMessage: { message: { documentMessage: { contextInfo: { isForwarded: true } } } } })).toEqual({ isForwarded: true });
    expect(contextOf({ conversation: "oi" })).toEqual({ isForwarded: false });
    expect(contextOf({ messageContextInfo: {}, imageMessage: { contextInfo: { stanzaId: "" } } })).toEqual({ isForwarded: false });
    expect(contextOf(undefined)).toEqual({ isForwarded: false });
  });

  it("lê a legenda de foto, vídeo e documento; legenda em branco não conta", () => {
    expect(captionOf({ imageMessage: { caption: "quadro" } })).toBe("quadro");
    expect(captionOf({ videoMessage: { caption: "demo" } })).toBe("demo");
    expect(captionOf({ documentWithCaptionMessage: { message: { documentMessage: { caption: "contrato" } } } })).toBe("contrato");
    expect(captionOf({ imageMessage: { caption: "  " } })).toBeUndefined();
    expect(captionOf({ audioMessage: { seconds: 3 } })).toBeUndefined();
  });
});
