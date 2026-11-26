// T007 (feature 008, D-06, D-11, interfaces/comando-mostrar.md §3 a §5): resposta de "mostra a N", determinística.
import { describe, expect, it } from "vitest";
import {
  MAX_TRANSCRIPT_CHARS,
  composeOriginal,
  deletedReply,
  noRecentReply,
  notFoundReply,
  outOfRangeReply,
} from "../../../src/modules/agent/domain/original.js";
import type { CitedMessage, ContextMessage, SourceAudio } from "../../../src/modules/retrieval/index.js";
import { validateAgentReply } from "../../../src/platform/contracts/validator.js";

const ID = "6f1c8a52-1d3e-4a4b-9a0e-2b4f0c9d7e11";
const AUDIO_ID = "0a05cfd1-7a02-4687-86d3-dbe8526cf836";
const at = (day: number, hour: number, minute: number) => new Date(Date.UTC(2026, 10, day, hour + 3, minute)); // hora de Brasília

const neighbor = (author: string, minute: number, text: string, extra: Partial<ContextMessage> = {}): ContextMessage => ({
  messageId: `${minute}`,
  author,
  sentAt: at(12, 14, minute),
  kind: "text",
  text,
  ...extra,
});

const textMessage = (text: string): CitedMessage => ({ messageId: ID, author: "Ana", sourceTitle: "T3", sentAt: at(12, 14, 32), kind: "text", text });

const audio = (extra: Partial<SourceAudio> = {}): SourceAudio => ({
  attachmentId: AUDIO_ID,
  mimeType: "audio/ogg; codecs=opus",
  sizeBytes: 54_321,
  durationSeconds: 102,
  stored: true,
  processing: "done",
  segments: [
    { start: 0, end: 12, text: "bom dia pessoal" },
    { start: 12, end: 37, text: "recado rápido" },
    { start: 37, end: 45, text: "o SLA do Pyroscope caiu" },
    { start: 45, end: 62, text: "já abrimos o chamado" },
    { start: 62, end: 102, text: "qualquer coisa me chamem" },
  ],
  ...extra,
});
const audioMessage = (extra: Partial<SourceAudio> = {}): CitedMessage => ({ ...textMessage(""), kind: "audio", audio: audio(extra) });

describe("mensagem de texto", () => {
  it("cabeçalho, texto inteiro e a conversa em volta com a citada marcada; a citação mantém o número", () => {
    const long = "Recomendo o Temporal. ".repeat(40).trim();
    const reply = composeOriginal({ index: 2 }, {
      message: textMessage(long),
      before: [neighbor("Bruno", 28, "alguém usou orquestrador?"), neighbor("Carla", 30, "", { kind: "audio", text: "eu usei o Airflow", durationSeconds: 42 })],
      after: [neighbor("Bruno", 35, "x".repeat(400))],
    });
    expect(reply.text).toBe(
      [
        "[2] Ana em T3, 12/11/2026 às 14:32:",
        "",
        long,
        "",
        "Conversa em volta:",
        "14:28 Bruno: alguém usou orquestrador?",
        "14:30 Carla: [áudio de 0:42] eu usei o Airflow",
        `» 14:32 Ana: ${long.slice(0, 280)}…`,
        `14:35 Bruno: ${"x".repeat(280)}…`,
      ].join("\n"),
    );
    expect(reply).toMatchObject({ outcome: "answered", citations: [{ index: 2, messageId: ID, author: "Ana", sourceTitle: "T3", kind: "text" }] });
    expect(reply.media).toBeUndefined();
    expect(validateAgentReply(reply).ok).toBe(true);
  });

  it("vizinha de outro dia ganha a data; sem vizinhas, não há a seção", () => {
    const withOtherDay = composeOriginal({ index: 1 }, { message: textMessage("oi"), before: [{ ...neighbor("Bruno", 2, "ontem"), sentAt: at(11, 18, 2) }], after: [] });
    expect(withOtherDay.text).toContain("11/11 18:02 Bruno: ontem");
    const alone = composeOriginal({ index: 1 }, { message: textMessage("oi"), before: [], after: [] });
    expect(alone.text).toBe("[1] Ana em T3, 12/11/2026 às 14:32:\n\noi");
  });

  it("guardado (feature 009, D-11): o cabeçalho diz o tema e quando foi guardado, sem conversa em volta", () => {
    const message = { ...textMessage("o Temporal resolveu"), author: "Você", sourceTitle: "Guardados · leituras", savedTheme: "leituras" };
    const saved = composeOriginal({ index: 2 }, { message, before: [], after: [] });
    expect(saved.text).toBe("[2] Guardado em leituras em 12/11/2026 às 14:32:\n\no Temporal resolveu");
    expect(saved.citations[0]).toMatchObject({ author: "Você", sourceTitle: "Guardados · leituras" });
  });
});

describe("áudio", () => {
  it("transcrição por segmentos com o trecho citado marcado e o arquivo em seguida", () => {
    const reply = composeOriginal({ index: 1, audioStartS: 37, audioEndS: 45 }, { message: audioMessage(), before: [], after: [] });
    expect(reply.text).toBe(
      [
        "[1] Ana em T3, 12/11/2026 às 14:32, áudio de 1:42:",
        "",
        "0:00 bom dia pessoal",
        "0:12 recado rápido",
        "» 0:37 o SLA do Pyroscope caiu",
        "0:45 já abrimos o chamado",
        "1:02 qualquer coisa me chamem",
        "",
        "Mando o áudio em seguida.",
      ].join("\n"),
    );
    expect(reply.media).toEqual([
      { kind: "audio", ref: AUDIO_ID, mimeType: "audio/ogg; codecs=opus", durationSeconds: 102, sizeBytes: 54_321, failureText: 'Não consegui mandar o arquivo do áudio agora. Tente "mostra a 1" de novo daqui a pouco.' },
    ]);
    expect(reply.citations[0]).toMatchObject({ index: 1, kind: "audio", audioStartS: 37, audioEndS: 45 });
    expect(validateAgentReply(reply).ok).toBe(true);
  });

  it("transcrição longa vira uma janela em volta do trecho citado", () => {
    const segments = Array.from({ length: 400 }, (_, i) => ({ start: i * 10, end: i * 10 + 10, text: `trecho ${i} ${"fala ".repeat(10)}` }));
    const reply = composeOriginal({ index: 1, audioStartS: 2000, audioEndS: 2010 }, { message: audioMessage({ segments, durationSeconds: 4000 }), before: [], after: [] });
    expect(reply.text).toContain("» 33:20 trecho 200");
    expect(reply.text).toContain("(…)");
    expect(reply.text).not.toContain("trecho 0 ");
    const body = reply.text.split("\n").filter((l) => /^(» )?\d+:\d\d/.test(l)).join("\n");
    expect(body.length).toBeLessThanOrEqual(MAX_TRANSCRIPT_CHARS);
  });

  it.each([
    ["pending", "A transcrição deste áudio ainda não está pronta."],
    ["failed", "Não consegui transcrever este áudio."],
    ["too_long", "Este áudio é longo demais para transcrever."],
    ["empty", "Não encontrei fala neste áudio."],
  ])("transcrição %s mostra o estado e manda o arquivo do mesmo jeito", (processing, text) => {
    const reply = composeOriginal({ index: 1 }, { message: audioMessage({ processing, segments: [] }), before: [], after: [] });
    expect(reply.text).toContain(text);
    expect(reply.media).toHaveLength(1);
  });

  it("arquivo não guardado ou grande demais: só o texto, com o aviso", () => {
    const missing = composeOriginal({ index: 1 }, { message: audioMessage({ stored: false, sizeBytes: null }), before: [], after: [] });
    expect(missing.text).toContain("O arquivo deste áudio não está guardado, então mando só a transcrição.");
    expect(missing.media).toBeUndefined();
    const big = composeOriginal({ index: 1 }, { message: audioMessage({ sizeBytes: 16 * 1024 * 1024 + 1 }), before: [], after: [] });
    expect(big.text).toContain("O arquivo deste áudio é grande demais para mandar por aqui.");
    expect(big.media).toBeUndefined();
  });

  it("áudio com legenda mostra a legenda antes da transcrição", () => {
    const reply = composeOriginal({ index: 1 }, { message: { ...audioMessage(), text: "ouçam o aviso" }, before: [], after: [] });
    expect(reply.text).toContain("ouçam o aviso\n\n0:00 bom dia pessoal");
  });
});

describe("sem mensagem para mostrar", () => {
  it("textos de cada caso", () => {
    expect(noRecentReply().text).toBe('Não tenho citações recentes para mostrar. Faça a pergunta de novo e depois mande "mostra a" com o número da citação.');
    expect(outOfRangeReply(1).text).toBe('A última resposta tem só 1 citação. Mande "mostra a 1".');
    expect(outOfRangeReply(3).text).toBe('A última resposta tem só 3 citações. Mande "mostra a 1" até "mostra a 3".');
    expect(deletedReply().text).toBe("Essa conversa foi apagada, então não consigo mostrar a mensagem.");
    expect(notFoundReply().text).toBe("Não encontrei mais essa mensagem.");
    for (const reply of [noRecentReply(), outOfRangeReply(2), deletedReply(), notFoundReply()]) expect(validateAgentReply(reply).ok).toBe(true);
  });
});
