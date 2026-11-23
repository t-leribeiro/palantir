// Fuso horário (D-06) e chave de importação determinística (D-07).
import { createHash } from "node:crypto";
import type { LocalDateTime } from "./parse.js";

/** Converte a hora local do arquivo (no fuso informado) para um instante UTC, sem biblioteca externa. */
export function localToUtc(local: LocalDateTime, timeZone: string): Date {
  const formatter = zoneFormatter(timeZone);
  const asUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
  // Primeiro palpite com o deslocamento no instante "ingênuo"; a segunda passada corrige perto do horário de verão.
  let guess = asUtc - offsetMs(formatter, asUtc);
  guess = asUtc - offsetMs(formatter, guess);
  return new Date(guess);
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function zoneFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = formatters.get(timeZone);
  if (cached) return cached;
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    throw new RangeError(`Fuso horário inválido: ${timeZone}. Use um nome IANA, ex.: America/Sao_Paulo.`);
  }
  formatters.set(timeZone, formatter);
  return formatter;
}

/** Deslocamento do fuso (ms) no instante dado: hora de parede no fuso menos o instante em UTC. */
function offsetMs(formatter: Intl.DateTimeFormat, instant: number): number {
  const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map((p) => [p.type, p.value]));
  const wall = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return wall - Math.floor(instant / 1000) * 1000;
}

export interface KeyInput {
  readonly conversation: string;
  readonly sentAt: Date;
  readonly author: string;
  readonly text: string;
}

/**
 * SHA-256 de (conversa, minuto, autor normalizado, texto normalizado, ordinal). O ordinal conta as
 * repetições idênticas no mesmo minuto, então "ok" enviado duas vezes vira duas mensagens (RN-03) e
 * reimportar gera as mesmas chaves (RN-02).
 */
export function assignImportKeys(messages: readonly KeyInput[]): string[] {
  const seen = new Map<string, number>();
  return messages.map((m) => {
    const base = [
      m.conversation.trim(),
      minuteIso(m.sentAt),
      m.author.trim().replace(/\s+/g, " ").toLowerCase(),
      m.text.replace(/\s+/g, " ").trim(),
    ].join("\u0000");
    const ordinal = seen.get(base) ?? 0;
    seen.set(base, ordinal + 1);
    return createHash("sha256").update(`${base}\u0000${ordinal}`).digest("hex");
  });
}

function minuteIso(date: Date): string {
  return date.toISOString().slice(0, 16);
}
