// Léxico de conceitos do embedder falso (feature 007, D-11): junta as palavras das paráfrases dos cenários de aceite
// (requirements.md#7) para que a busca por sentido rode na esteira sem modelo. Termos são prefixos sem acento.
import type { ConceptLexicon } from "../../src/modules/knowledge/index.js";

export const TEST_CONCEPTS: ConceptLexicon = {
  custo: ["cust", "gast", "barat", "econom", "reduz", "cort", "caro"],
  infraestrutura: ["cluster", "infra", "nuvem", "kubernet", "servidor"],
  orquestrar: ["orquestr", "coorden", "workflow", "process", "fluxo"],
  demorado: ["longa", "demorad", "durac", "lent"],
  mensageria: ["mensager", "fila", "kafka", "rabbit"],
  observabilidade: ["telemetr", "observab", "monitor", "metric"],
};
