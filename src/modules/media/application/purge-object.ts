// Purga de um arquivo de mídia sem referência (feature 009, D-13): o "esquece a N" apaga a mensagem no banco e, se a
// chave cifrada ficou sem anexo, publica `media.purge_object` pelo outbox na mesma transação. O worker confere de
// novo a referência antes de apagar: o mesmo conteúdo pode ter sido guardado outra vez no meio tempo.
import type { ObjectStore } from "./ports.js";

export const PURGE_OBJECT_QUEUE = "media.purge_object";

export interface PurgeObjectJob {
  readonly key: string;
}

export type PurgeObjectOutcome = "purged" | "kept" | "invalid";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const OBJECT_KEY = new RegExp(`^${UUID}/${UUID}/[0-9a-f]{64}$`);

/** Só uma chave exata `<espaço>/<fonte>/<sha256>` é purgada: nunca um prefixo que alcance outros objetos. */
export function isObjectKey(key: string): boolean {
  return OBJECT_KEY.test(key);
}

export interface PurgeObjectDeps {
  readonly store: Pick<ObjectStore, "deletePrefix">;
  /** Algum anexo ainda usa esta chave? */
  readonly isReferenced: (key: string) => Promise<boolean>;
}

export function createPurgeObject(deps: PurgeObjectDeps): (job: PurgeObjectJob) => Promise<PurgeObjectOutcome> {
  return async ({ key }) => {
    if (!isObjectKey(key)) return "invalid";
    if (await deps.isReferenced(key)) return "kept";
    await deps.store.deletePrefix(key);
    return "purged";
  };
}
