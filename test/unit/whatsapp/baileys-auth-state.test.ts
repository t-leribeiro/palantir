// T013: estado de autenticação persistido no arquivo criptografado (D-05): credenciais e todas as chaves
// voltam iguais depois de reiniciar, inclusive buffers e o mapeamento de LID.
import { describe, expect, it } from "vitest";
import { createPersistedAuthState } from "../../../src/channels/whatsapp/provider/baileys-provider.js";
import type { EncryptedFileStore } from "../../../src/channels/whatsapp/session/encrypted-file-store.js";

function memoryStore(): EncryptedFileStore & { saved: () => string | null } {
  let text: string | null = null;
  return {
    load: async () => text,
    save: (value) => void (text = value),
    flush: async () => undefined,
    remove: async () => void (text = null),
    saved: () => text,
  };
}

describe("createPersistedAuthState", () => {
  it("sem sessão, cria credenciais novas", async () => {
    const { state, isNew } = await createPersistedAuthState(memoryStore());
    expect(isNew).toBe(true);
    expect(state.creds.noiseKey.public).toBeInstanceOf(Uint8Array);
  });

  it("credenciais e chaves sobrevivem a um reinício", async () => {
    const store = memoryStore();
    const first = await createPersistedAuthState(store);
    await first.state.keys.set({ "lid-mapping": { "5511988887777": "123456789012345" }, session: { "abc.0": new Uint8Array([1, 2, 3]) } });
    first.saveCreds();
    expect(store.saved()).not.toBeNull();

    const second = await createPersistedAuthState(store);
    expect(second.isNew).toBe(false);
    expect(Buffer.from(second.state.creds.noiseKey.private).equals(Buffer.from(first.state.creds.noiseKey.private))).toBe(true);
    expect(await second.state.keys.get("lid-mapping", ["5511988887777"])).toEqual({ "5511988887777": "123456789012345" });
    const session = await second.state.keys.get("session", ["abc.0"]);
    expect(Buffer.from(session["abc.0"] as Uint8Array)).toEqual(Buffer.from([1, 2, 3]));
  });

  it("apagar uma chave (valor null) remove ela do estado salvo", async () => {
    const store = memoryStore();
    const auth = await createPersistedAuthState(store);
    await auth.state.keys.set({ "lid-mapping": { a: "1" } });
    await auth.state.keys.set({ "lid-mapping": { a: null } });
    const reloaded = await createPersistedAuthState(store);
    expect(await reloaded.state.keys.get("lid-mapping", ["a"])).toEqual({});
  });
});
