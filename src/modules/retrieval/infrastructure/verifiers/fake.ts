// Verificador falso para testes (feature 007, interfaces/verificador-externo.md §5): p = 0,9 quando o trecho contém um
// dos marcadores, 0,1 nos demais. Sem rede.
import type { EvidenceVerifier } from "../../application/search-evidence.js";

export function createFakeVerifier(options: { readonly markers?: readonly string[]; readonly down?: () => boolean } = {}): EvidenceVerifier {
  const markers = (options.markers ?? []).map((m) => m.toLowerCase());
  return {
    provider: "fake",
    async verify(_question, candidates) {
      if (options.down?.()) throw new Error("verificador fora do ar");
      return new Map(candidates.map((c) => [c.id, markers.some((m) => c.text.toLowerCase().includes(m)) ? 0.9 : 0.1]));
    },
  };
}
