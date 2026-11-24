// Provedor WhatsApp simulado (feature 003, D-03): mesma porta do real, sem rede nem número. Usado pela
// suíte de contrato, pelo E2E e pelos testes do adaptador.
import { MediaUnavailableError } from "../../../contracts/channel/knowledge-channel.js";
import { isGroupJid } from "./mapping.js";
import type { GroupInfo, IncomingDirect, IncomingGroupMessage, SessionState, WhatsAppProvider } from "./provider.js";

export interface SentText {
  readonly chatJid: string;
  readonly text: string;
}

export interface SimulatedProvider extends WhatsAppProvider {
  /** Entrega uma mensagem ao adaptador e espera ele terminar de tratá-la (inclusive a resposta). */
  deliver(message: IncomingDirect): Promise<void>;
  /** Entrega uma mensagem de grupo e espera o adaptador terminar (feature 004). */
  deliverGroup(message: IncomingGroupMessage): Promise<void>;
  /** Troca a lista de grupos do número e avisa o adaptador. */
  setGroups(groups: readonly GroupInfo[], complete?: boolean): void;
  setState(state: SessionState, reason?: string): void;
  emitQr(qr: string): void;
  sent(): readonly SentText[];
  clearSent(): void;
  /** As próximas `count` chamadas de envio falham. */
  failNextSends(count: number): void;
  /** Feature 005: entrega um áudio de grupo com o arquivo disponível para `downloadMedia`. */
  deliverGroupAudio(message: Omit<IncomingGroupMessage, "kind" | "media">, audio: { bytes: Uint8Array; seconds?: number }): Promise<void>;
  /** Os próximos `count` downloads falham (`download_failed`). */
  failNextDownloads(count: number): void;
  /** Referências cujo arquivo foi baixado, na ordem. */
  downloads(): readonly string[];
  isStarted(): boolean;
}

export function createSimulatedProvider(): SimulatedProvider {
  const sent: SentText[] = [];
  const qrListeners: ((qr: string) => void)[] = [];
  const stateListeners: ((state: SessionState, reason?: string) => void)[] = [];
  let onDirect: ((message: IncomingDirect) => Promise<void>) | undefined;
  let onGroup: ((message: IncomingGroupMessage) => Promise<void>) | undefined;
  const groupListeners: ((groups: readonly GroupInfo[], complete: boolean) => void)[] = [];
  let groups: readonly GroupInfo[] = [];
  let started = false;
  let failures = 0;
  const media = new Map<string, Uint8Array>();
  const downloaded: string[] = [];
  let downloadFailures = 0;

  const provider: SimulatedProvider = {
    async start() {
      started = true;
      provider.setState("connected");
    },
    async stop() {
      started = false;
    },
    onQr: (listener) => void qrListeners.push(listener),
    onState: (listener) => void stateListeners.push(listener),
    onDirectMessage(listener) {
      onDirect = listener;
    },
    async sendText(chatJid, text) {
      if (isGroupJid(chatJid)) throw new Error("envio a grupo bloqueado");
      if (!started) throw new Error("provedor simulado parado");
      if (failures > 0) {
        failures -= 1;
        throw new Error("falha simulada de envio");
      }
      sent.push({ chatJid, text });
    },
    onGroupMessage(listener) {
      onGroup = listener;
    },
    onGroupsChanged: (listener) => void groupListeners.push(listener),
    async listGroups() {
      return groups;
    },
    async deliverGroup(message) {
      if (!onGroup) throw new Error("nenhum listener de mensagem de grupo registrado");
      await onGroup(message);
    },
    async deliverGroupAudio(message, audio) {
      const fetchRef = `sim-${message.id}`;
      media.set(fetchRef, audio.bytes);
      const seconds = audio.seconds === undefined ? {} : { seconds: audio.seconds };
      await provider.deliverGroup({ ...message, kind: "audio", media: { mimeType: "audio/ogg; codecs=opus", sizeBytes: audio.bytes.length, fetchRef, ...seconds } });
    },
    async downloadMedia(fetchRef) {
      const bytes = media.get(fetchRef);
      if (!bytes) throw new MediaUnavailableError("expired");
      if (downloadFailures > 0) {
        downloadFailures -= 1;
        throw new MediaUnavailableError("download_failed");
      }
      downloaded.push(fetchRef);
      return bytes;
    },
    failNextDownloads(count) {
      downloadFailures = count;
    },
    downloads: () => [...downloaded],
    setGroups(next, complete = true) {
      groups = complete ? [...next] : [...groups.filter((g) => !next.some((n) => n.groupId === g.groupId)), ...next];
      for (const listener of groupListeners) listener(next, complete);
    },
    async deliver(message) {
      if (!onDirect) throw new Error("nenhum listener de mensagem registrado");
      await onDirect(message);
    },
    setState(state, reason) {
      for (const listener of stateListeners) listener(state, reason);
    },
    emitQr(qr) {
      for (const listener of qrListeners) listener(qr);
    },
    sent: () => [...sent],
    clearSent() {
      sent.length = 0;
    },
    failNextSends(count) {
      failures = count;
    },
    isStarted: () => started,
  };
  return provider;
}
