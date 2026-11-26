// Arquivo do áudio de volta ao dono (feature 008, D-08, interfaces/canal-anexo-de-audio.md §2): só para a conta
// ativa dona do espaço do anexo, decifrado só na memória e conferido pelo SHA-256. Implementa a porta
// OutboundMediaLoader do contrato do canal; o adaptador nunca conhece banco nem armazenamento.
import { createHash } from "node:crypto";
import { MediaUnavailableError, type OutboundMediaLoader } from "../../../contracts/channel/knowledge-channel.js";
import type { ObjectStore } from "./ports.js";

/** Anexo guardado do espaço da conta (provider + id externo, ativa), ou `null`. */
export interface OutboundMediaLookup {
  find(provider: string, externalAccountId: string, attachmentId: string): Promise<{ storageKey: string; mimeType: string; sha256: string } | null>;
}

export interface LoadOutboundMediaDeps {
  /** Canal de quem recebe: a conta é procurada só nele. */
  readonly provider: string;
  readonly lookup: OutboundMediaLookup;
  readonly store: Pick<ObjectStore, "get">;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createLoadOutboundMedia(deps: LoadOutboundMediaDeps): OutboundMediaLoader {
  return async (destinationAccountId, ref) => {
    if (!UUID.test(ref)) throw new MediaUnavailableError("expired");
    const found = await deps.lookup.find(deps.provider, destinationAccountId, ref);
    if (!found) throw new MediaUnavailableError("expired");
    const bytes = await deps.store.get(found.storageKey).catch(() => {
      throw new MediaUnavailableError("download_failed");
    });
    if (createHash("sha256").update(bytes).digest("hex") !== found.sha256) throw new MediaUnavailableError("expired");
    return { bytes, mimeType: found.mimeType };
  };
}
