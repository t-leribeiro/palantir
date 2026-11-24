# Legacy impact: Gerenciar grupos conversando com o agente (fatia S5)

> Identificador: `006-gerenciar-grupos-pelo-agente`
> Data: `2026-11-24`
> Feature greenfield sobre as features 001 a 005, sem legado extraído de código. Âncora: `prd.md`, specs SDD e os adendos `addenda/001-*` a `addenda/005-*` e `addenda/bug-*`.
> Política de edição no momento da execução: `allowLegacyEdits: true`, `allowedPaths: []` (projeto inteiro liberado).
> Execução: 24 de 24 ações.

## Arquivos afetados

| Arquivo afetado | Componente (spec) | Tipo | Severidade | Justificativa |
|-----------------|-------------------|------|------------|---------------|
| `migrations/0008_source_management.sql` (novo) | identity-and-sources, conversational-agent | delta-de-dados | HIGH | Tabelas `channel_account_verifications`, `agent_conversation_state`, `source_deletions` e `audit_events`; índice `sources (space_id)`; contas ativas sem verificação voltam a `pending` (exceto `fake`) |
| `src/modules/identity/**` | identity-and-sources | regra-alterada | HIGH | Código de verificação (hash com sal, 10 min, 5 tentativas); o vínculo deixa a conta `pending`; a resolução devolve o estado da conta |
| `src/modules/sources/**` | identity-and-sources | componente-novo | HIGH | Serviço de gestão (lista, acompanhar, parar, alvo da exclusão), exclusão em duas etapas (pedido e job), purga pela porta `MediaPurger`, aviso reivindicável, auditoria e métricas |
| `src/modules/agent/**` | conversational-agent | regra-alterada | HIGH | Comandos por palavras fixas, conta pendente só com o código, estado curto da conversa, respostas de gestão, filtro por grupo na pergunta e ajuda nova |
| `src/modules/retrieval/**` | retrieval | regra-alterada | LOW | `sourceIds` na `SearchRequest` e filtro `m.source_id = ANY($6)` |
| `src/modules/media/**` | media-transcription | regra-alterada | MEDIUM | `deletePrefix` e `listKeys` no armazenamento; `createMediaPurger` por fonte |
| `src/main/management.ts` (novo), `src/main/notify.ts` (novo), `src/main/compose.ts` | platform-foundation | componente-novo | MEDIUM | Filas `sources.delete` e `agent.notify.<canal>`; worker de exclusão com sondagem; aviso no processo do canal; o WhatsApp sempre com fila |
| `src/main/whatsapp-link.ts`, `src/main/whatsapp-groups.ts`, `src/main/audit.ts` (novo), `package.json` | identity-and-sources, platform-foundation | regra-alterada | MEDIUM | `whatsapp:link` com código; `whatsapp:grupos` com auditoria e `apagar --nome`; comando `npm run auditoria` |
| `scripts/media-conferir.ts`, `scripts/media/orphans.ts` (novo) | media-transcription | regra-alterada | LOW | `media:conferir` conta objetos de conversas apagadas |
| `infra/local/config/grafana/dashboards/gestao.json` (novo), `infra/local/config/prometheus/rules.yml` | platform-foundation | componente-novo | LOW | Painel "Gestão" e alerta `SourceDeletionStalled` |
| `test/**` (unit, integration, e2e, support) | platform-foundation | componente-novo | LOW | TDD da fatia. Os E2E da S2 a S4 e a integração da S2 passam a verificar a conta (`test/support/link.ts`) |
| `docs/adr/0011-*.md` (novo), `docs/adr/README.md`, `README.md`, `CLAUDE.md`, `AGENTS.md`, `docs/plano-de-fatias.md` | platform-foundation | componente-novo | LOW | Decisão da fatia, base legal, comandos novos e estado da S5 |

Arquivos pré-existentes modificados: os das features 001 a 005 listados acima. Nenhum arquivo anterior ao pipeline foi alterado.

## Diff conceitual por componente

- **identity:** o vínculo era um ato do operador e ativava a conta na hora. Agora a conta fica `pending` até o dono mandar ao agente o código que o terminal mostrou. A migração devolveu a `pending` a conta pessoal vinculada na S2.
- **sources:** antes, só autorizar e revogar pelo terminal. Agora há:
  - um serviço de gestão comum ao agente e ao terminal;
  - a exclusão em duas etapas: a confirmação marca `deleting` e publica o job; o worker purga a mídia e apaga em cascata;
  - o aviso ao dono e a auditoria sem conteúdo.
- **agent:** antes de buscar, o agente trata, nesta ordem:
  - a conta pendente, que só pode mandar o código;
  - a confirmação pendente;
  - os comandos de gestão;
  - a ajuda.

  A pergunta que cita o nome de uma conversa busca só nela.
- **retrieval:** filtro opcional por fonte, sem mudar o contrato.
- **media:** purga por prefixo de fonte e listagem de chaves.
- **platform-foundation:** filas, worker de exclusão, aviso no canal, painel, alerta e os comandos `auditoria` e `media:conferir`.

## Preservadas

Feature greenfield: não há regras 🟢 extraídas de código para preservar. Os testes das features 001 a 005 continuam verdes, com a verificação de conta acrescentada nos que vinculam o número. O contrato do canal não mudou (o aviso usa o `sendReply`). O comando de terminal da S3 continua aceitando `listar`, `autorizar` e `revogar`.

## Modificadas

Feature greenfield: nenhuma regra 🟢 alterada ou removida. Regras 🟡 que evoluem:
- **RF-03 de `identity-and-sources`** (verificação por código enviado pelo canal): o código é mostrado no terminal e o dono o manda ao agente (esclarecimento de 2026-11-24).
- **OQ-01 de `identity-and-sources`** (base legal): decidida como consentimento declarado por grupo (ADR-0011).
- **RN-06 da S3** ("revogar mantém o histórico até a S5"): o histórico agora pode ser apagado com `apagar`.
- **RN-08 da S3** ("nenhum número escreve espontaneamente"): abre-se só a exceção do aviso de exclusão pedida pelo próprio dono.
