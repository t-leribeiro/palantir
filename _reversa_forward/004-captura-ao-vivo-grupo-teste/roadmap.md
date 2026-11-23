# Roadmap: Captura ao vivo de um grupo de teste autorizado (fatia S3)

> Identificador: `004-captura-ao-vivo-grupo-teste`
> Data: `2026-11-23`
> Requirements: `_reversa_forward/004-captura-ao-vivo-grupo-teste/requirements.md`
> Confidência: 🟢 CONFIRMADO, 🟡 INFERIDO, 🔴 LACUNA

## 1. Resumo da abordagem

O adaptador WhatsApp da S2 ganha um segundo papel: além de **responder** (mensagens diretas → agente), ele passa a **capturar** (mensagens de grupo → ingestão). O papel vem da configuração `PALANTIR_WHATSAPP_CAPTURE`:
- `off`: comportamento da S2.
- `agent`: o próprio número do agente captura, o modo escolhido no esclarecimento.
- `dedicated`: um segundo provedor com sessão própria só captura.

A autorização de captura é um registro novo e auditado, ligado a uma fonte. Ela não reaproveita o status da fonte, porque revogar a captura não pode desautorizar o histórico importado. O processo `dev:whatsapp` mantém no banco a lista de grupos que o número conhece, e um comando novo (`npm run whatsapp:grupos`) lista, autoriza e revoga, sem abrir uma segunda conexão com o WhatsApp.

A ingestão ganha a reconciliação entre mensagens ao vivo e importadas, nos dois sentidos, dentro da mesma transação de gravação. A mensagem ao vivo usa o `conversationId` da fonte autorizada (ex.: `export:t3`), então a resolução de fonte da ingestão não muda. Indexação, busca e agente continuam como estão: a mensagem capturada vira pesquisável pelo mesmo job de indexação que o worker já processa.

## 2. Princípios aplicados

`.reversa/principles.md` não existe neste projeto. Valem os princípios de produto e engenharia do `CLAUDE.md` e do `_reversa_sdd/prd.md`.

| Princípio | Como a feature se relaciona | Status |
|-----------|------------------------------|--------|
| WhatsApp-first, not WhatsApp-only | Grupos chegam ao núcleo como `CanonicalMessage` `live`; a biblioteca continua só em `baileys-provider.ts`; a suíte de contrato passa a rodar os testes de captura | respeita |
| Knowledge-first, Evidence over hallucination | Captura alimenta a mesma evidência citável; reconciliação evita citações duplicadas | respeita |
| Capture once, remember forever (com retenção e exclusão) | Mensagem guardada uma vez (id externo + reconciliação). Exclusão e retenção continuam para a S5 | respeita, com pendência conhecida |
| Security First, Local First, privacidade | Opt-in por grupo com consentimento declarado e auditado; nada é enviado a grupos; logs sem texto, telefone, nome de pessoa ou nome de grupo | respeita |
| Documentation e API First | Interfaces (CLI, porta do provedor, saída da ingestão, health) descritas antes do código; OpenAPI atualizado se o health mudar | respeita |
| TDD, pirâmide de testes, complexidade ≤ 10, testes de arquitetura | Reconciliação e roteamento no domínio e na aplicação (cobertos por mutação); provedor simulado para contrato e E2E | respeita |
| Dois números (decisão de 2026-11-23) | O modo `agent` é provisório e assume um risco conhecido: um bloqueio causado pela captura derruba as respostas | conflita temporariamente, aceito no esclarecimento |

## 3. Decisões técnicas

| ID | Decisão | Justificativa | Alternativas descartadas | Confidência |
|----|---------|----------------|--------------------------|-------------|
| D-01 | `PALANTIR_WHATSAPP_CAPTURE` = `off` (padrão), `agent` ou `dedicated`. No `dedicated`, a sessão fica em `capture-session.enc` na mesma pasta e com a mesma chave | Esclarecimento 1a: trocar de modo sem mudar código | Dois processos separados (dobra a operação local sem ganho agora); variável booleana (não expressa o modo dedicado) | 🟢 |
| D-02 | O canal WhatsApp recebe `roles: { answer, capture }`. No modo `agent`, um canal com os dois papéis; no `dedicated`, dois canais (agente só responde; captura só captura e descarta mensagens diretas) | Reaproveita sessão, reconexão, recibos e observabilidade da S2; RN-08 vira regra de papel | Um adaptador novo só para captura (duplica o ciclo de vida da sessão) | 🟡 |
| D-03 | A porta `WhatsAppProvider` ganha `onGroupMessage`, `listGroups` e `onGroupsChanged`, e o provedor recebe `acceptGroups`. Sem captura, os grupos continuam ignorados já no provedor, como na S2 | Mantém a biblioteca isolada (regra `whatsapp-lib-isolated`) e o simulador como dublê | Expor objetos do Baileys ao canal (viola o isolamento) | 🟢 |
| D-04 | Autorização de captura em tabela própria `source_captures` (fonte, grupo, dono, declaração de consentimento, autorizada em, revogada em), com histórico (revogar marca `revoked_at`; reautorizar cria linha nova) e no máximo uma captura ativa por grupo | Revogar a captura não pode desautorizar a fonte importada; o histórico é a auditoria pedida (RN-02, RF-03, RF-08) | Reusar `sources.status` (revogar desligaria também a importação); coluna de apelido em `sources` (sem auditoria nem consentimento); tabela genérica de auditoria (YAGNI nesta fatia) | 🟡 |
| D-05 | Roteamento por consulta a cada mensagem de grupo: grupo → captura ativa → (`provider`, `accountId` do dono, `conversationId` da fonte). Sem cache, para a revogação ter efeito imediato | RF-08; uma consulta indexada por mensagem é barata no volume de um grupo de teste | Cache com invalidação (complexidade sem necessidade medida) | 🟢 |
| D-06 | Autorizar sem `--conversa` cria uma fonte `group` autorizada com `conversationId` = id do grupo no WhatsApp e título = nome do grupo; com `--conversa "T3"`, usa a fonte `export:t3` do dono (erro se não existir) | Esclarecimento 3a; a importação posterior com `--conversa "T3"` já cai na mesma fonte (id determinístico da S1) | Casamento por nome (recusado no esclarecimento) | 🟢 |
| D-07 | Diretório de grupos: o processo `dev:whatsapp` grava no banco (`whatsapp_groups`: id do grupo, nome, nº de participantes, visto em) ao conectar e em `groups.upsert`/`groups.update`; o comando lê do banco e mostra a data da última atualização | Uma segunda conexão com as mesmas credenciais derruba a primeira (código 440, `connectionReplaced`) | Comando que conecta ao WhatsApp (conflito de sessão); endpoint administrativo no health (abre superfície HTTP nova) | 🟢 |
| D-08 | Comando `npm run whatsapp:grupos -- listar \| autorizar <grupo> --consentimento "<texto>" [--conversa "<nome>"] [--dono <provider:conta>] \| revogar <grupo>`. `<grupo>` aceita o número da listagem atual ou o id do grupo | Mesmo padrão de `whatsapp:link` e `import`; o número da listagem é fácil de digitar | Interface web (fora da v0.1); gerenciar pelo agente (S5) | 🟡 |
| D-09 | Reconciliação na ingestão, nos dois sentidos, na mesma transação. Importada sem chave conhecida: procura uma mensagem ao vivo da mesma fonte, com texto normalizado igual, \|Δt\| ≤ 60 s e sem proveniência de importação. Ao vivo sem id conhecido: o simétrico. Com mais de uma candidata, vence a mais próxima no tempo e o nome do autor desempata. Na reconciliação, grava a chave que faltava (`import_key` ou `external_message_id`) e a nova proveniência; o resultado é `reconciled` | RN-04 (autor fora do critério); gravar a chave torna a próxima reimportação idempotente pelo índice existente | Reconciliar num job posterior (janela com duplicata visível nas respostas); exigir autor igual (nunca casa: nome do contato × número) | 🟡 |
| D-10 | Texto normalizado para reconciliar: NFC, minúsculas, espaços colapsados e aparados. A janela de 60 s é constante do domínio, medida na demonstração | Export tem precisão de minuto (OQ-01 de `ingestion`) | Hash do texto bruto (quebra com espaços e quebras de linha diferentes no export) | 🟡 |
| D-11 | Remetente em grupo: número de `participant`, `participantAlt` ou `lidMapping`, nesta ordem, em E.164. Sem número, `externalId` = `lid:<id>`. Nome exibido: nome de perfil; senão número mascarado; senão "Participante" | RN-10; grupos do WhatsApp usam cada vez mais LID | Guardar só o nome (não identifica a pessoa entre mensagens) | 🟡 |
| D-12 | Só texto vira mensagem. Mídia e outros tipos são contados por tipo e descartados sem download; reações, enquetes, edições e protocolo já são ignorados pelo `classifyContent` da S2 | RN-07; mídia é a S4 | Gravar mensagem de mídia sem anexo (vira evidência vazia) | 🟢 |
| D-13 | Mensagem com horário anterior à autorização da captura é descartada (motivo `before_authorization`); reentregas posteriores passam e são deduplicadas | RN-01: nada anterior à autorização | Aceitar tudo que o WhatsApp entregar na reconexão (traria mensagens pré-consentimento) | 🟡 |
| D-14 | O processo `dev:whatsapp` passa a montar a ingestão (`buildIngest` com pg-boss só para publicar), e o job `knowledge.index` sai na mesma transação; o worker já existente indexa | Mesmo caminho do canal de teste e da importação; latência dominada pelo polling do pg-boss (~2 s) | Ingerir via HTTP no processo da API (acopla processos) | 🟢 |
| D-15 | `sendText` do provedor recusa destino de grupo (`@g.us`) | RN-08: nenhum número escreve em grupos, garantido no ponto de saída | Confiar só no fluxo do canal | 🟢 |
| D-16 | Observabilidade: `whatsapp_captured_total{outcome}`, `whatsapp_capture_discarded_total{reason}` (`not_authorized`, `direct`, `media`, `before_authorization`), `whatsapp_capture_ignored_media_total{kind}`; `whatsapp_session_state` ganha o rótulo `role` (`agent`, `capture`); a ingestão passa a contar `reconciled`. Painel e alerta da S2 estendidos. Rótulos sem id de grupo (o id interno da fonte aparece só no comando) | RF-10 e privacidade nos logs | Rótulo por grupo nas métricas (expõe identificador de grupo em métricas) | 🟡 |
| D-17 | O canal WhatsApp com papel de captura declara `supportsLiveCapture: true` e `listConversations()` devolve os grupos do diretório; a suíte de contrato roda os testes de captura com o simulador (`deliverGroup`) | RF-12; WhatsApp-first, not only | Suíte separada para captura (perde a comparação com o canal de teste) | 🟢 |

## 4. Premissas

Nenhuma `[DÚVIDA]` ficou em aberto: as três foram resolvidas no `/reversa-clarify` de 2026-11-23. Ficam as premissas técnicas a confirmar na demonstração:

| Premissa | Origem (`requirements.md` seção) | Risco se errada |
|----------|----------------------------------|-----------------|
| 60 s bastam para casar o horário do export (precisão de minuto) com o da captura | §10 Lacunas (OQ-01 de `ingestion`) | Duplicatas na reimportação; ajustável na constante, com teste |
| O Baileys entrega mensagens de grupo como `notify` com `participant` ou `participantAlt` resolvível | §4 RN-10 | Autor aparece como "Participante"; a citação continua com grupo e data |
| Um grupo de teste pequeno não leva o WhatsApp a bloquear o número do agente | §4 RN-03 (risco aceito) | Agente e captura param juntos; volta-se ao modo `off` e espera-se o segundo chip |

## 5. Delta arquitetural

| Componente | Arquivo de origem no legado | Tipo de mudança | Resumo |
|------------|------------------------------|-----------------|--------|
| whatsapp-baileys-adapter | `_reversa_sdd/sdd/whatsapp-baileys-adapter.md` + `addenda/003-*` | regra-alterada | Papéis `answer` e `capture`; grupos aceitos só com captura ligada; diretório de grupos; remetente de grupo por número ou LID; recusa enviar a grupos |
| ingestion | `_reversa_sdd/sdd/ingestion.md` + `addenda/002-*` | regra-alterada | RF-04 implementado com o critério da RN-04 (sem autor), nos dois sentidos; novo resultado `reconciled` |
| identity-and-sources | `_reversa_sdd/sdd/identity-and-sources.md` + `addenda/002-*`, `003-*` | componente-novo | Autorização de captura com consentimento e revogação (`source_captures`); roteamento grupo → fonte |
| channel-contract | `_reversa_sdd/sdd/channel-contract.md` + `addenda/003-*` | contrato-alterado | `IngestOutcome` ganha `reconciled` (tipo interno); suíte roda captura para o WhatsApp |
| whatsapp-export-importer | `_reversa_sdd/sdd/whatsapp-export-importer.md` + `addenda/002-*` | regra-alterada | Relatório mostra "Reconciliadas com a captura ao vivo" |
| platform-foundation | `_reversa_sdd/sdd/platform-foundation.md` + `addenda/003-*` | regra-alterada | Config do modo de captura; health com o estado da captura; painel e alerta com papel |

Arquivos que devem ser tocados (rascunho para o `legacy-impact.md`):
- **Adaptador WhatsApp:** `src/channels/whatsapp/{provider/provider.ts, provider/baileys-provider.ts, provider/simulated-provider.ts, provider/mapping.ts, whatsapp-channel.ts, observability.ts}`.
- **Módulos:** `src/modules/ingestion/{domain,application,infrastructure}/*`, `src/modules/sources/{domain,application,infrastructure}/*` e o `index.ts` de cada um.
- **Composição e comandos:** `src/main/{compose.ts, whatsapp.ts, whatsapp-groups.ts (novo), import.ts}`.
- **Plataforma e contrato:** `src/platform/config.ts`, `src/contracts/channel/knowledge-channel.ts`.
- **Banco:** `migrations/0006_*.sql`.
- **Observabilidade:** `infra/local/config/{grafana/dashboards/whatsapp.json, prometheus/rules.yml}`.
- **Configuração:** `.env.example`, `scripts/env-file.mjs`, `package.json`.
- **Testes:** os de cada camada.
- **Documentação:** `docs/adr/0009-*.md`, `README.md`, `CLAUDE.md`, `AGENTS.md`, `docs/plano-de-fatias.md`.

## 6. Delta no modelo de dados

- Resumo das mudanças:
  - Duas tabelas novas: `source_captures`, a autorização de captura auditada, e `whatsapp_groups`, o diretório de grupos do número.
  - Um índice novo em `messages (source_id, sent_at)` para a reconciliação.
  - `messages`, `sources` e `message_provenance` não mudam de forma. A reconciliação preenche `import_key` ou `external_message_id` que estavam nulos e acrescenta proveniência.
- Detalhe completo em: `_reversa_forward/004-captura-ao-vivo-grupo-teste/data-delta.md`

## 7. Delta de contratos externos

| Contrato | Tipo | Arquivo de detalhe |
|----------|------|--------------------|
| Comando `npm run whatsapp:grupos` | CLI | `interfaces/cli-whatsapp-grupos.md` |
| Porta `WhatsAppProvider` (grupos) | Interface interna do adaptador | `interfaces/whatsapp-provider-grupos.md` |
| Saída da ingestão (`IngestOutcome`) e relatório da importação | Interface interna do contrato do canal + CLI | `interfaces/ingestao-reconciliacao.md` |
| Health do processo WhatsApp (`:8081/health`) | HTTP | `interfaces/health-whatsapp.md` |

## 8. Plano de migração

1. A migração `0006` cria `source_captures`, `whatsapp_groups` e o índice. Ela só adiciona: o `down` remove as tabelas e o índice, e nada existente é alterado.
2. O padrão `PALANTIR_WHATSAPP_CAPTURE=off` deixa o comportamento idêntico ao da S2 até o operador ligar a captura. O `npm run setup` preserva a variável (lista `PRESERVED` de `scripts/env-file.mjs`).
3. **Rollback:** voltar para `off`. As mensagens já capturadas continuam pesquisáveis, e as autorizações ficam no histórico.
4. **Passagem para dois números:** parear o segundo chip com `PALANTIR_WHATSAPP_CAPTURE=dedicated`, sair do grupo com o número do agente e autorizar de novo o grupo para o número de captura. A autorização é por grupo, não por número, então revogar e reautorizar mantém a mesma fonte.

## 9. Riscos e mitigações

| Risco | Impacto | Probabilidade | Mitigação |
|-------|---------|---------------|-----------|
| Bloqueio do número do agente por causa da captura (modo `agent`) | alto | baixo | Número só lê grupos (nunca escreve, D-15); grupo pequeno e com consentimento; modo `off` como rollback imediato; segundo chip planejado |
| Reconciliação errada (casa mensagens diferentes ou não casa iguais) | médio | médio | Janela curta, texto normalizado, uma candidata por vez sem proveniência repetida; teste com export real local na demonstração; contagem `reconciled` no relatório |
| Captura de mensagens sem consentimento (grupo errado autorizado) | alto | baixo | Opt-in por grupo com declaração obrigatória; listagem antes de autorizar; revogação imediata; descarte do que é anterior à autorização |
| Exposição de dados de terceiros em logs, métricas ou repositório | alto | baixo | Logs só com id interno da fonte; teste E2E procura texto, telefone e nome nos logs; dados reais do grupo nunca no repositório |
| Diretório de grupos desatualizado (processo parado) | baixo | médio | Listagem mostra "atualizado em"; autorizar exige grupo visto no diretório |
| Volume de reconciliação deixa a importação lenta | baixo | baixo | Índice `(source_id, sent_at)`; consulta só quando a chave não existe; teste de carga da S1 continua no gate |

## 10. Critério de pronto

- RF-01 a RF-12 cobertos por testes, com os 16 cenários de `requirements.md` mapeados para unitário, integração, contrato ou E2E.
- 7 jobs da esteira verdes e DoR local (`npm run dor`), com mutação ≥ 60% nos módulos tocados.
- Demonstração manual com o chip, seguindo o `onboarding.md` deste diretório:
  - grupo de teste autorizado com consentimento declarado;
  - pergunta respondida em até 10 s com a mensagem do grupo;
  - revogação efetiva;
  - reimportação do grupo com "Reconciliadas" no relatório.
