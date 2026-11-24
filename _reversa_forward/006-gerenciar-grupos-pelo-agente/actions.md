# Actions: Gerenciar grupos conversando com o agente (fatia S5)

> Identificador: `006-gerenciar-grupos-pelo-agente`
> Data: `2026-11-24`
> Roadmap: `_reversa_forward/006-gerenciar-grupos-pelo-agente/roadmap.md`

## Resumo

| Métrica | Valor |
|---------|-------|
| Total de ações | 24 |
| Paralelizáveis (`[//]`) | 14 |
| Maior cadeia de dependência | 9 (T001 → T009 → T010 → T011 → T016 → T018 → T019 → T021 → T024) |

**Prática:** TDD. Os testes de integração da exclusão e o E2E de gestão (Fase 2) vêm antes da implementação. As demais ações escrevem o teste antes do código, no mesmo bloco. Os testes automáticos usam o canal de teste, o WhatsApp simulado, o motor falso e o SeaweedFS em container. Nenhum usa dado real.

**Tamanho:** 24 ações, acima das ~15 da regra das fatias. Se for preciso dividir, sem renumerar:
- a **S5a** leva a verificação, a lista, acompanhar, parar e o filtro por grupo: T001, T002, T004 a T010, T014 a T018, T020 (só a auditoria) e T022;
- a **S5b** leva a exclusão e o aviso: T003, T011 a T013, T019, T020 (`apagar`), T021, T023 e T024.

## Fase 1, Preparação

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T001 | **Migração `0008_source_management.sql`** conforme o `data-delta.md`:<br>• `channel_account_verifications`, com um código vivo por conta;<br>• `agent_conversation_state`;<br>• `source_deletions`, com `notify_*`;<br>• `audit_events`, com o CHECK das ações;<br>• índice `sources (space_id)`;<br>• `UPDATE` das contas ativas sem verificação (exceto `fake`).<br>O seed grava `verified_at` na conta do canal de teste. Teste de esquema na integração | - | `[//]` | `migrations/0008_source_management.sql` | 🟢 | `[X]` |
| T002 | **Definições das filas** `sources.delete` (12 tentativas, 30 s com recuo, 900 s, fila morta `sources.delete.dead`) e `agent.notify` (5 tentativas, 10 s, 120 s) em `QUEUES` | - | `[//]` | `src/main/compose.ts` | 🟡 | `[X]` |

## Fase 2, Testes

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T003 | **Integração da exclusão** (Postgres e SeaweedFS reais): uma fonte com mensagens, trechos, anexos, transcrições e objetos.<br>• Pedir a exclusão: a busca já ignora a fonte, e a ingestão e a importação recusam;<br>• executar o job: zero linhas e zero objetos, com as contagens gravadas;<br>• armazenamento fora do ar: falha, e a retentativa conclui;<br>• reentrega: idempotente, sem segundo aviso | T001 | `[//]` | `test/integration/source-deletion.test.ts` | 🟡 | `[X]` |
| T004 | **E2E de gestão pelo canal de teste** com os cenários do `requirements.md#7`:<br>• conta pendente e verificação;<br>• listar e "mais";<br>• acompanhar com confirmação e com confirmação expirada;<br>• parar;<br>• apagar com aviso, com nome errado e com mensagem durante a exclusão;<br>• ambiguidade e lista expirada;<br>• filtro por grupo;<br>• importar de novo depois de apagar | T001 | `[//]` | `test/e2e/source-management.test.ts` | 🟡 | `[X]` |

## Fase 3, Núcleo

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T005 | **Reconhecimento de comandos** (D-01): normalização e tabela de regras para `grupos`, `mais`, `acompanhar <ref>`, `parar <ref>`, `apagar <ref>`, `confirmo`, `confirmo apagar <nome>` e código de 6 dígitos. Devolve um comando tipado ou "não é comando". Testes por tabela, com complexidade ≤ 10 | - | `[//]` | `src/modules/agent/domain/command.ts` | 🟢 | `[X]` |
| T006 | **Resolução da referência e da página** (D-04, D-15):<br>• número da lista vigente (até 30 min);<br>• nome exato normalizado;<br>• trecho único;<br>• ambíguo com as candidatas;<br>• paginação de 30 itens e o texto de cada linha com o estado.<br>Funções puras com testes | - | `[//]` | `src/modules/agent/domain/conversation-ref.ts` | 🟢 | `[X]` |
| T007 | **Verificação de posse** (D-11):<br>• gerar o código de 6 dígitos (sal e SHA-256, 10 min, invalidando o anterior);<br>• verificar (tempo constante, 5 tentativas, `consumed_at`, `invalidated_at`, ativar a conta com `verified_at`);<br>• a resolução de usuário passa a devolver o estado da conta.<br>Repositório Postgres e testes | T001 | `[//]` | `src/modules/identity/application/verify-account.ts` | 🟢 | `[X]` |
| T008 | **`whatsapp:link` com código**, conforme `interfaces/cli-vinculo-grupos-auditoria.md` §1: a conta fica `pending`, o código aparece só no terminal, o número verificado responde "já verificado" e o `pending` ganha um código novo. Testes do comando | T007 | - | `src/main/whatsapp-link.ts` | 🟢 | `[X]` |
| T009 | **Auditoria** (D-13): porta `AuditLog` e repositório de `audit_events`, com ações tipadas e detalhes só com contagens. Consulta paginada para o comando `auditoria`. Testes que recusam nome ou texto nos detalhes | T001 | `[//]` | `src/modules/sources/application/audit.ts` | 🟡 | `[X]` |
| T010 | **Serviço de gestão de fontes** (D-03, D-04, D-06, D-19):<br>• `listForSpace`, juntando o diretório e as fontes, com os estados e "acompanhado por outra conta";<br>• `catalog`, com os nomes das fontes do espaço fora de exclusão;<br>• `follow`, sobre o `createCaptureAdmin`, com a declaração fixa e a ligação com a importação de mesmo nome;<br>• `stop`;<br>• auditoria das duas ações. Testes | T001, T009 | - | `src/modules/sources/application/source-management.ts` | 🟡 | `[X]` |
| T011 | **Pedido de exclusão** (D-07), numa transação:<br>• confere o estado de novo;<br>• `deleting`;<br>• revoga a captura;<br>• `source_deletions` com `notify_*`;<br>• `source.deletion_requested`;<br>• outbox `sources.delete`.<br>"Já em exclusão" responde sem erro. Testes | T002, T010 | - | `src/modules/sources/application/request-deletion.ts` | 🟢 | `[X]` |
| T012 | **Purga de mídia por fonte** (D-08): `deletePrefix` no armazenamento (`ListObjectsV2` paginado, `DeleteObjects` com até 1.000 chaves, idempotente) e porta `MediaPurger.purgeSource(spaceId, sourceId)` exportada pelo módulo `media`. Teste de integração com o SeaweedFS | - | `[//]` | `src/modules/media/infrastructure/object-store/s3-object-store.ts` | 🟡 | `[X]` |
| T013 | **Execução do job `sources.delete`** (D-08, D-09), conforme `interfaces/jobs-exclusao-e-aviso.md` §1:<br>• carregar e sair se já concluída;<br>• contar;<br>• purgar;<br>• `DELETE` em cascata e limpeza do estado da conversa;<br>• concluir, auditar `source.deleted` e publicar `agent.notify` pelo outbox.<br>Passa o T003 | T011, T012 | - | `src/modules/sources/application/execute-deletion.ts` | 🟡 | `[X]` |
| T014 | **Estado curto da conversa** (D-02): repositório de `agent_conversation_state`, com:<br>• gravar a lista e a página;<br>• gravar a ação pendente;<br>• consumir a pendente de forma atômica (`UPDATE … RETURNING`, com prazo);<br>• ler com expiração.<br>Testes de integração | T001 | `[//]` | `src/modules/agent/infrastructure/pg-conversation-state.ts` | 🟡 | `[ ]` |
| T015 | **Caminho da conta pendente no agente** (D-20, RN-02), antes de tudo:<br>• desconhecida: política atual;<br>• `pending` com 6 dígitos: verificar, com as respostas de `interfaces/comandos-do-agente.md` §3;<br>• `pending` com outro texto: a instrução.<br>Nenhuma busca para `pending`. Testes | T007 | - | `src/modules/agent/application/ask-question.ts` | 🟢 | `[ ]` |
| T016 | **Comandos de gestão no agente** (RF-02 a RF-05, RF-08, RF-10): `manage-sources.ts` orquestra a ação pendente, depois o comando e depois a ajuda, com as portas `SourceManagement`, `ConversationState` e o pedido de exclusão. Respostas e erros de `interfaces/comandos-do-agente.md` §2 e §4. A ajuda ganha "Seus grupos" (D-18). Testes por cenário | T005, T006, T010, T011, T014, T015 | - | `src/modules/agent/application/manage-sources.ts` | 🟡 | `[ ]` |
| T017 | **Filtro por grupo na pergunta** (D-14, RN-11):<br>• `questionScope` recebe o catálogo, reconhece o nome completo mais longo e o tira da pergunta;<br>• nome repetido devolve as opções;<br>• a `SearchRequest` ganha `sourceIds`, com o filtro `m.source_id = ANY($6)` no SQL.<br>Testes unitários e de integração (combinado com "em qual áudio") | T010 | `[//]` | `src/modules/agent/domain/question.ts` | 🟡 | `[ ]` |

## Fase 4, Integração

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T018 | **Composição:**<br>• `createAskQuestion` recebe a verificação, a gestão, o estado, o catálogo e a auditoria, na API (canal de teste) e no processo do WhatsApp;<br>• o worker consome `sources.delete` com o `MediaPurger`;<br>• o processo do WhatsApp sempre com fila.<br>Passa o T004 até o aviso | T008, T013, T016, T017 | - | `src/main/compose.ts` | 🟡 | `[ ]` |
| T019 | **Consumidor de `agent.notify`** (D-10), conforme `interfaces/jobs-exclusao-e-aviso.md` §2:<br>• reivindicar `notified_at`;<br>• `sendReply`;<br>• devolver em caso de falha;<br>• limpar `notify_title`.<br>Ligado no processo do WhatsApp e na API. O canal de teste guarda os envios numa lista consultável pelo E2E. Passa o T004 completo | T018 | - | `src/main/notify.ts` | 🟡 | `[ ]` |
| T020 | **Comandos de terminal** conforme `interfaces/cli-vinculo-grupos-auditoria.md` §2 e §3: `whatsapp:grupos -- apagar <grupo> --confirmar "<nome>"` (RF-13) e o comando novo `npm run auditoria` (RF-09), com telefone mascarado e fonte apagada como "(apagada)". Testes dos dois | T009, T011 | `[//]` | `src/main/audit.ts` | 🟡 | `[ ]` |
| T021 | **E2E pelo WhatsApp simulado** (RF-11):<br>• verificação, listar, acompanhar, parar, apagar com aviso e filtro por grupo pelo provedor simulado;<br>• mensagem ao vivo de grupo em exclusão descartada sem download (RF-07);<br>• comando escrito dentro de um grupo não executa;<br>• remetente desconhecido em silêncio | T019 | - | `test/e2e/whatsapp-management.test.ts` | 🟢 | `[ ]` |

## Fase 5, Polimento

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T022 | **Observabilidade** (D-16), sem nomes nem telefones nos rótulos:<br>• métricas de comandos, exclusões (em andamento, mais antiga, duração, itens) e avisos;<br>• painel "Gestão" no Grafana;<br>• alerta `SourceDeletionStalled`, validado pelo `promtool`;<br>• teste que procura nomes de grupo e telefones nos logs do E2E | T018 | `[//]` | `infra/local/config/grafana/dashboards/gestao.json` | 🟡 | `[ ]` |
| T023 | **`media:conferir` conta os objetos sem fonte**: prefixos `<space>/<source>/` cuja fonte não existe mais, para conferir a exclusão. Teste | T012 | `[//]` | `scripts/media-conferir.ts` | 🟡 | `[ ]` |
| T024 | **Documentação:**<br>• ADR-0011 (gestão pelo agente, verificação, exclusão em duas etapas, base legal por consentimento, que fecha a OQ-01);<br>• README, `CLAUDE.md` e `AGENTS.md` com os comandos novos;<br>• `docs/plano-de-fatias.md` com a S5 🔄 e a linha de histórico | T021, T022 | - | `docs/adr/0011-gestao-de-fontes-pelo-agente.md` | 🟢 | `[ ]` |

## Notas de execução

(vazio até o `/reversa-coding`)

## Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-11-24 | Versão inicial gerada por `/reversa-to-do` | reversa |
