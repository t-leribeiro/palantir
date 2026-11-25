# Legacy impact: Achar o mesmo assunto dito com outras palavras (fatia S6)

> Identificador: `007-achar-assunto-outras-palavras`
> Data: `2026-11-25`
> Feature greenfield sobre as features 001 a 006, sem legado extraído de código. Âncora: `prd.md`, as specs SDD e os adendos `addenda/001-*` a `addenda/006-*` e `addenda/bug-*`.
> Política de edição no momento da execução: `allowLegacyEdits: true`, `allowedPaths: []` (projeto inteiro liberado).
> Execução: 23 de 23 ações.

## Arquivos afetados

| Arquivo afetado | Componente (spec) | Tipo | Severidade | Justificativa |
|-----------------|-------------------|------|------------|---------------|
| `migrations/0009_semantic_search.sql` (novo) | knowledge-indexing, retrieval | delta-de-dados | HIGH | `palantir_norm`, `embedding_models` (um ativo, um em construção), `chunk_embeddings` (cascata pelo trecho) e `message_chunks.text_norm` com índice de trigramas |
| `src/modules/knowledge/**` | knowledge-indexing | componente-novo | HIGH | Porta `Embedder` e adaptadores (`openai-compatible`, `voyage`, `fake`); registro de modelos e vetores; cálculo junto da indexação; varredura; sentido da pergunta no modelo ativo; métricas |
| `src/modules/retrieval/**` | retrieval | regra-alterada | HIGH | Três formas de busca com os filtros em cada uma, fusão RRF, decisão por sinais, `degraded`, porta `EvidenceVerifier` e o adaptador da TypeSafe |
| `src/main/search.ts` (novo), `src/main/compose.ts` | platform-foundation | componente-novo | MEDIUM | Escolha do cálculo e do verificador pela configuração, registro do modelo, varredura no worker, sondagem do motor, spans por forma de busca e avisos de serviço remoto |
| `src/platform/config.ts` | platform-foundation | regra-alterada | MEDIUM | `PALANTIR_EMBEDDER*`, limiares, `PALANTIR_TYPO_SEARCH` e `PALANTIR_VERIFIER*`, com a liberação explícita de serviço remoto |
| `infra/modules/embedder/main.tf` (novo), `infra/local/main.tf` | platform-foundation | componente-novo | MEDIUM | Text Embeddings Inference em CPU, em `127.0.0.1:8091`, com volume de modelos e o modelo vindo do `.env` |
| `scripts/infra.mjs`, `scripts/env-file.mjs`, `.env.example` | platform-foundation | regra-alterada | LOW | O setup passa o modelo ao Terraform e preserva as escolhas da busca; uma variável presente vale mesmo vazia |
| `scripts/eval.ts`, `scripts/eval/summary.ts` (novo), `eval/cases.json`, `package.json` | platform-foundation (avaliação) | regra-alterada | MEDIUM | Casos por tipo (66), modos `palavra`, `combinada` e `verificador`, comparação e regressão de palavra exata |
| `scripts/eval-busca.ts`, `scripts/busca-modelos.ts`, `scripts/busca/*` (novos) | knowledge-indexing | componente-novo | LOW | Medição dos modelos num container temporário, só com números; download dos candidatos |
| `scripts/doctor.mjs` | platform-foundation | regra-alterada | LOW | Mostra se o motor de embeddings responde e qual modelo serve |
| `infra/local/config/grafana/dashboards/busca.json` (novo), `infra/local/config/prometheus/rules.yml` | platform-foundation | componente-novo | LOW | Painel "Busca" e os alertas `EmbeddingBacklogStalled` e `EmbedderDown` |
| `.dependency-cruiser.cjs` | platform-foundation | regra-nova | LOW | `embedder-engine-isolated` e `verifier-engine-isolated` |
| `test/**` (unit, integration, e2e, support) | platform-foundation | componente-novo | LOW | TDD da fatia. Os testes antigos da busca passaram a esperar 50 candidatas por forma de busca e o campo `degraded` |
| `docs/adr/0012-*.md` (novo), `docs/adr/README.md`, `README.md`, `CLAUDE.md`, `AGENTS.md`, `docs/plano-de-fatias.md` | platform-foundation | componente-novo | LOW | A decisão da fatia, os comandos novos e o estado da S6 |

Arquivos pré-existentes modificados: os das features 001 a 006 listados acima. Nenhum arquivo anterior ao pipeline foi alterado.

## Diff conceitual por componente

- **knowledge-indexing:** antes, um trecho por mensagem com índice textual. Agora, cada trecho também ganha um vetor do modelo ativo:
  - o vetor é calculado logo depois da indexação, ou pela varredura;
  - fica numa tabela própria, ligada ao trecho e ao modelo;
  - trocar de modelo é configuração, e os dois modelos convivem até o novo ficar completo.
- **retrieval:** antes, só a palavra exata, e o "não encontrei" vinha da fração de termos. Agora:
  - três formas de busca (palavra, palavra parecida e sentido), cada uma com o filtro do espaço, do tipo, da fonte e da exclusão;
  - a fusão é por posição, e só é citado o que passa no próprio limiar;
  - um verificador externo opcional pode decidir no lugar dos limiares;
  - sem o motor, a busca segue por palavra e marca `degraded`.
- **conversational-agent:** sem mudança na resposta nem na citação. O agente só usa a decisão nova da busca.
- **platform-foundation:**
  - container do motor local;
  - variáveis novas com a liberação explícita;
  - varredura no worker;
  - painel, alertas e `doctor`;
  - eval por tipo e por modo;
  - comandos de medição.

## Preservadas

Feature greenfield: não há regras 🟢 extraídas de código para preservar.
- Os testes das features 001 a 006 continuam verdes. Os da busca foram ajustados para as 50 candidatas e o campo `degraded`.
- O contrato do canal e o `AgentReply` não mudaram.
- A busca por palavra exata continua acertando os 24 casos `exata` do eval.

## Modificadas

Feature greenfield: nenhuma regra 🟢 alterada ou removida. Regras 🟡 que evoluem:
- **RF-03 de `retrieval`** (fusão RRF): implementada. Ela substitui a divergência da S0, em que o score era a fração de termos.
- **RF-08 de `retrieval`** (`low_confidence`): o limiar agora vale por forma de busca, e só é citado o que passa no próprio sinal.
- **RF-03 e RF-04 de `knowledge-indexing`** (embedding por trecho, com modelo e dimensão registrados): o vetor fica em `chunk_embeddings`, com o modelo em `embedding_models`, e não numa coluna do trecho. A divisão em trechos de 512 tokens continua adiada.
- **OQ-01 de `knowledge-indexing`** (qual modelo local): será decidida pela medição com as perguntas reais e registrada no ADR-0012.
