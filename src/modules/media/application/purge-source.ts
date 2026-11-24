// Purga dos arquivos de mídia de uma fonte apagada (feature 006, D-08). A chave do objeto é
// `<space>/<source>/<sha256>` (feature 005, D-04), então o prefixo da fonte não alcança outra fonte.
import type { ObjectStore } from "./ports.js";

export interface SourceMediaPurger {
  purgeSource(spaceId: string, sourceId: string): Promise<number>;
}

export function sourcePrefix(spaceId: string, sourceId: string): string {
  if (!spaceId || !sourceId || spaceId.includes("/") || sourceId.includes("/")) throw new Error("espaço e fonte são obrigatórios na purga");
  return `${spaceId}/${sourceId}/`;
}

export function createMediaPurger(store: Pick<ObjectStore, "deletePrefix">): SourceMediaPurger {
  return { purgeSource: (spaceId, sourceId) => store.deletePrefix(sourcePrefix(spaceId, sourceId)) };
}
