# Actions: Captura ao vivo de um grupo de teste autorizado (fatia S3)

> Identificador: `004-captura-ao-vivo-grupo-teste`
> Data: `2026-11-23`
> Roadmap: `_reversa_forward/004-captura-ao-vivo-grupo-teste/roadmap.md`

## Resumo

| Métrica | Valor |
|---------|-------|
| Total de ações | 16 |
| Paralelizáveis (`[//]`) | 9 |
| Maior cadeia de dependência | 5 (T001 → T003 → T005 → T011 → T014) |

Prática: TDD. O teste de integração da reconciliação (Fase 2) vem antes da implementação; as demais ações escrevem o teste antes do código no mesmo bloco.

Tamanho: 16 ações, perto das ~15 da regra das fatias (`docs/plano-de-fatias.md`).

## Fase 1, Preparação

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T001 | Migração `0006_live_capture.sql`: tabelas `source_captures` (com `UNIQUE (provider, group_id) WHERE revoked_at IS NULL` e consentimento de 10 a 500 caracteres) e `whatsapp_groups`, índice `messages (source_id, sent_at)`, `down` simétrico; teste de integração de que a segunda captura ativa do mesmo grupo é recusada e de que, depois da revogação, uma nova é aceita | - | `[//]` | `migrations/0006_live_capture.sql` | 🟡 | `[X]` |
| T002 | Configuração `PALANTIR_WHATSAPP_CAPTURE` (`off` padrão, `agent`, `dedicated`; valor inválido é recusado com mensagem clara) em `config.ts` e `.env.example`; `scripts/env-file.mjs` preserva a variável no `npm run setup`; testes da configuração e do merge do `.env` | - | `[//]` | `src/platform/config.ts` | 🟢 | `[X]` |

## Fase 2, Testes

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T003 | Teste de integração (vermelho) da ingestão com reconciliação, com PostgreSQL real. Cenários: 20 mensagens ao vivo e depois a importação das mesmas resultam em 20 `reconciled` e 20 registros; a reimportação seguinte dá `duplicate`; importada primeiro e ao vivo depois dá `reconciled`; dois "ok" no mesmo minuto casam um a um; diferença de 61 s não casa; mensagem reconciliada mantém texto e autor e ganha as duas proveniências | T001 | - | `test/integration/live-capture-ingestion.test.ts` | 🟡 | `[X]` |

## Fase 3, Núcleo

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T004 | Domínio da reconciliação: `normalizeForMatch` (NFC, minúsculas, espaços colapsados), `RECONCILE_WINDOW_MS = 60_000` e `pickCandidate` (menor \|Δt\|, depois nome do autor igual, depois `sent_at` e `id`); testes unitários com os limites da janela e os desempates | - | `[//]` | `src/modules/ingestion/domain/reconcile.ts` | 🟡 | `[X]` |
| T005 | Fluxo de reconciliação na ingestão: `IngestOutcome` ganha `reconciled` no contrato do canal; a porta do store ganha busca de candidatas com `FOR UPDATE` e preenchimento da chave nula mais proveniência; `ingest-message` tenta a chave, depois a reconciliação, depois a inserção, sem novo job de indexação quando reconcilia; consumidores atuais tratam o novo resultado; T003 fica verde | T003, T004 | - | `src/modules/ingestion/application/ingest-message.ts` | 🟡 | `[X]` |
| T006 | Autorização de captura no módulo `sources`: `authorizeCapture` (grupo do diretório; consentimento de 10 a 500 caracteres; `--conversa` resolve a fonte `export:<nome>` do dono ou cria fonte `group` com o nome do grupo; recusa grupo já autorizado), `revokeCapture` e `routeGroup(groupId)` (fonte, conta do dono e momento da autorização, ou `null`); portas `CaptureRepository` e `GroupDirectory`; testes unitários com repositórios em memória | - | `[//]` | `src/modules/sources/application/capture-authorization.ts` | 🟡 | `[X]` |
| T007 | Infraestrutura PostgreSQL de `sources`: `pg-capture-repository.ts` (autorizar, revogar, rotear, listar com status) e `pg-group-directory.ts` (sincronizar a lista, marcar saída); exportar pelo `index.ts`; teste de integração de autorizar, rotear, revogar e reautorizar a mesma fonte | T001, T006 | - | `src/modules/sources/infrastructure/pg-capture-repository.ts` | 🟡 | `[X]` |
| T008 | Porta do provedor para grupos: `IncomingGroupMessage`, `GroupInfo`, `onGroupMessage`, `listGroups` e `onGroupsChanged`; simulador com `deliverGroup` e `setGroups`; `mapping.ts` com o filtro de JID dependente de `acceptGroups` e a resolução do participante; `sendText` do simulador recusa grupos; testes unitários | - | `[//]` | `src/channels/whatsapp/provider/provider.ts` | 🟢 | `[X]` |
| T009 | Provedor real com grupos: opção `acceptGroups`, mensagens `notify` de `@g.us`, autor por `participant`, `participantAlt` ou `lidMapping`, diretório por `groupFetchAllParticipating` ao conectar e por `groups.upsert`/`groups.update`, saída do próprio número por `group-participants.update`, trava de envio a grupo; testes com a biblioteca simulada (`vi.mock`, como em `baileys-reconnect.test.ts`) | T008 | - | `src/channels/whatsapp/provider/baileys-provider.ts` | 🟡 | `[X]` |
| T010 | Canal com papéis `answer` e `capture`. Mensagem de grupo passa por roteamento e filtros (`not_authorized`, `before_authorization`, mídia contada por tipo) e vira `CanonicalMessage` `live`, com autor E.164 ou `lid:`, nome exibido pelo perfil, número mascarado ou "Participante". No papel só de captura, mensagens diretas são descartadas. `listConversations` lê o diretório e `supportsLiveCapture` segue o papel; o diretório sincroniza a cada mudança. Testes unitários; teste de contrato do canal com captura, usando o simulador | T008 | - | `src/channels/whatsapp/whatsapp-channel.ts` | 🟡 | `[X]` |

## Fase 4, Integração

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T011 | Composição e processo. `buildWhatsApp` monta os modos `off`, `agent` e `dedicated`: ingestão com pg-boss só para publicar, roteador e diretório de `sources`, segundo provedor com `capture-session.enc` no `dedicated` e QR com título por número. O health ganha `capture`: `HealthStatus` aceita `off`, tratado como saudável, e o enum do OpenAPI é atualizado sem drift. Testes da composição | T002, T005, T007, T009, T010 | - | `src/main/compose.ts` | 🟡 | `[X]` |
| T012 | Comando `npm run whatsapp:grupos` (`listar`, `autorizar <grupo> --consentimento --conversa --dono`, `revogar <grupo>`), com mensagens e códigos de saída de `interfaces/cli-whatsapp-grupos.md`, mais o script no `package.json`. Testes unitários do parser e da formatação; teste de integração dos três subcomandos | T007 | `[//]` | `src/main/whatsapp-groups.ts` | 🟡 | `[X]` |
| T013 | Relatório da importação com "Reconciliadas com a captura ao vivo" (só quando maior que 0) e a soma importadas + já existentes + reconciliadas igual ao total de texto; testes do importador e da formatação | T005 | `[//]` | `src/channels/whatsapp-export/importer.ts` | 🟢 | `[X]` |
| T014 | E2E com provedor simulado e PostgreSQL real, no modo `agent`. Cenários: grupo autorizado com mensagem respondida com citação (autor, grupo e horário); grupo não autorizado sem gravar nada; revogação com efeito imediato; áudio só contado; mensagem anterior à autorização descartada; mensagem direta continua sendo pergunta; nada é enviado ao grupo; importação depois da captura sem duplicata; logs sem texto, telefone, nome de participante nem nome de grupo | T011, T012, T013 | - | `test/e2e/whatsapp-capture.test.ts` | 🟢 | `[X]` |

## Fase 5, Polimento

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T015 | Observabilidade: `whatsapp_captured_total{outcome}`, `whatsapp_capture_discarded_total{reason}`, `whatsapp_capture_ignored_media_total{kind}`, rótulo `role` em `whatsapp_session_state` e `reconciled` na métrica da ingestão; painéis de captura no dashboard "WhatsApp"; alerta `WhatsAppLoggedOut` por papel; testes do observador | T011 | `[//]` | `src/channels/whatsapp/observability.ts` | 🟡 | `[X]` |
| T016 | Documentação: nota no ADR-0009 (modo `agent` provisório e risco aceito), nota no ADR-0004 (`IngestOutcome.reconciled`), comandos e modos de captura no `README.md`, `CLAUDE.md` e `AGENTS.md`, S3 em andamento no `docs/plano-de-fatias.md` | T012 | `[//]` | `docs/adr/0009-adaptador-whatsapp-nao-oficial.md` | 🟢 | `[X]` |

## Notas de execução

- T005: a reconciliação confere antes a própria chave (`findByKey`). Sem isso, a reimportação de uma mensagem já reconciliada poderia casar com outra mensagem igual ("ok") na mesma janela. A rota do canal de teste e o OpenAPI passaram a aceitar `reconciled` (enum de `FakeInboundResponse`).
- T008: `onGroupsChanged` recebe também `complete` (lista inteira ou parcial). É assim que o diretório marca os grupos de que o número saiu; `interfaces/whatsapp-provider-grupos.md` foi atualizado.
- T010: a lógica de captura ficou em `src/channels/whatsapp/capture.ts`, e o canal só a conecta conforme o papel. As opções do canal foram para `resolveOptions`/`sendDefaults` para manter a complexidade ≤ 10. As métricas de captura entraram no observador já nesta ação; a T015 acrescentou o rótulo `role`, o painel e os alertas.
- T011: os testes da composição são os do E2E (T014), que sobe `buildWhatsApp` nos modos `agent` e `dedicated`. A validação do modo `dedicated` sem provedor de captura acontece antes de abrir banco e fila, porque a primeira versão deixava conexões abertas (achado pelo E2E). O health da S2 agora mostra `capture: "off"`.
- T015: `promtool check rules` (imagem `prom/prometheus:v3.15.1`, a mesma do Terraform) aprovou as 2 regras, agora por papel.

## Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-11-23 | Versão inicial gerada por `/reversa-to-do` | reversa |
