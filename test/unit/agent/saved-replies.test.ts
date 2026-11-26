// T007 (feature 009, comandos-guardar.md §2 a §5): respostas do guardar, listar e esquecer.
import { describe, expect, it } from "vitest";
import {
  SAVE_TEXT,
  composeEmptyTheme,
  composeSaveReply,
  composeThemeListing,
  composeThemes,
  forgetPreview,
  type SaveSummary,
} from "../../../src/modules/agent/domain/saved-replies.js";

const none: SaveSummary = { theme: "arquitetura", saved: 0, duplicates: 0, noCaption: 0, unsupported: 0, mediaOff: 0, failed: 0, overflow: 0 };

describe("resposta do guardar", () => {
  it("confirma um ou vários itens com o tema", () => {
    expect(composeSaveReply({ ...none, saved: 1 }).text).toBe("Guardei em arquitetura.");
    expect(composeSaveReply({ ...none, saved: 3 }).text).toBe("Guardei 3 itens em arquitetura.");
  });

  it("avisa a duplicata, sozinha ou junto do que foi guardado", () => {
    expect(composeSaveReply({ ...none, duplicates: 1 }).text).toBe("Isso já estava guardado em arquitetura.");
    expect(composeSaveReply({ ...none, saved: 2, duplicates: 1 }).text).toBe("Guardei 2 itens em arquitetura; 1 já estava guardado.");
  });

  it("explica o que ficou de fora, no singular quando era só aquilo", () => {
    expect(composeSaveReply({ ...none, noCaption: 1 }).text).toBe("Dessa mensagem eu só guardaria a legenda, e ela não tem.");
    expect(composeSaveReply({ ...none, unsupported: 1 }).text).toBe("Esse tipo de mensagem eu não guardo.");
    expect(composeSaveReply({ ...none, saved: 2, noCaption: 2 }).text).toBe(
      "Guardei 2 itens em arquitetura.\n2 sem legenda ficaram de fora: de foto, vídeo e documento eu só guardo a legenda.",
    );
    expect(composeSaveReply({ ...none, mediaOff: 1 }).text).toBe("Não consigo guardar áudio agora: o armazenamento de mídia não está ligado.");
    expect(composeSaveReply({ ...none, saved: 20, overflow: 3 }).text).toBe("Guardei 20 itens em arquitetura.\nOutros 3 passaram do limite de 20 por vez.");
  });

  it("falha total pede para tentar de novo; falha parcial diz quantos", () => {
    expect(composeSaveReply({ ...none, failed: 2 }).text).toBe(SAVE_TEXT.failed("arquitetura"));
    expect(composeSaveReply({ ...none, saved: 1, failed: 1 }).text).toBe("Guardei em arquitetura.\nNão consegui guardar 1 item agora; tente de novo daqui a pouco.");
  });

  it("sem nada, diz que não há o que guardar", () => {
    expect(composeSaveReply(none).text).toBe(SAVE_TEXT.nothingToSave);
  });
});

describe("listagem", () => {
  const savedAt = new Date("2026-11-25T17:02:00Z");

  it("numera os itens com data e hora, cita cada um como guardado pelo dono e mostra quantos faltam", () => {
    const reply = composeThemeListing("Leituras", 14, [
      { messageId: "m1", kind: "text", text: "o Temporal resolveu os workflows longos", savedAt },
      { messageId: "m2", kind: "audio", text: "a gente decidiu usar filas", savedAt, durationSeconds: 102 },
      { messageId: "m3", kind: "audio", text: null, savedAt },
    ]);
    expect(reply.outcome).toBe("answered");
    expect(reply.text.split("\n")).toEqual([
      "Guardados em Leituras (14):",
      "1. 25/11/2026 14:02: “o Temporal resolveu os workflows longos” [1]",
      "2. 25/11/2026 14:02, áudio de 1:42: “a gente decidiu usar filas” [2]",
      "3. 25/11/2026 14:02, áudio (transcrição pendente) [3]",
      "",
      "Mostrando os 3 mais recentes de 14.",
      '"mostra a 2" abre o item inteiro; "esquece a 2" apaga.',
    ]);
    expect(reply.citations[1]).toEqual({ index: 2, messageId: "m2", author: "Você", sourceTitle: "Guardados · Leituras", sentAt: savedAt.toISOString(), kind: "audio" });
  });

  it("lista os temas com a contagem e sugere temas quando o pedido não tem itens", () => {
    expect(composeThemes([{ theme: "arquitetura", count: 3 }, { theme: "leituras", count: 1 }]).text).toBe("Seus temas: arquitetura (3), leituras (1).");
    expect(composeThemes([]).text).toBe(SAVE_TEXT.noThemes);
    expect(composeEmptyTheme("finanças", []).text).toBe("Você ainda não guardou nada sobre finanças.");
    expect(composeEmptyTheme("finanças", [{ theme: "leituras" }]).text).toBe("Você ainda não guardou nada sobre finanças.\nSeus temas: leituras.");
  });

  it("a confirmação do esquecer mostra até 60 caracteres", () => {
    expect(forgetPreview("x".repeat(80))).toHaveLength(60);
    expect(forgetPreview(null)).toBe("o áudio");
  });
});
