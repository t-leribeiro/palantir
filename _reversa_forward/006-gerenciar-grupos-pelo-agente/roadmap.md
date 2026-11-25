# Roadmap: Gerenciar grupos conversando com o agente (fatia S5)

> Identificador: `006-gerenciar-grupos-pelo-agente`
> Data: `2026-11-24`
> Requirements: `_reversa_forward/006-gerenciar-grupos-pelo-agente/requirements.md`
> Confidência: 🟢 CONFIRMADO, 🟡 INFERIDO, 🔴 LACUNA

## 1. Resumo da abordagem

Os comandos de gestão ("grupos", "acompanhar", "parar", "apagar", as confirmações e o código de verificação) entram no núcleo do agente. São reconhecidos por palavras fixas, como a ajuda da S2, sem LLM. O agente fala com um serviço novo de gestão de fontes no módulo `sources`. Esse serviço reaproveita as regras da autorização de captura da S3 (consentimento, ligação com a importação) e também é usado pelo comando de terminal.

O estado curto da conversa fica numa tabela do Postgres: a última lista mostrada e a confirmação pendente, cada uma com o seu prazo. Assim ele sobrevive a reinícios e vale para o canal de teste e para o WhatsApp.

Apagar acontece em duas etapas:
- **Na confirmação, numa transação:** a fonte vira `deleting` (a busca já a esconde), a captura é revogada, a exclusão e a auditoria são registradas e o job `sources.delete` é publicado pelo outbox.
- **No worker:** o job conta o que vai apagar, remove do armazenamento os arquivos de mídia pelo prefixo da fonte e apaga a fonte, e as chaves estrangeiras levam o resto em cascata. Depois registra a conclusão e publica `agent.notify`.

O processo do canal consome `agent.notify` e manda o aviso pelo `sendReply` que o contrato já tem. Não há mudança de contrato.

**Verificação da conta:** o `whatsapp:link` gera um código de 6 dígitos, mostrado no terminal. O agente aceita esse código vindo de uma conta `pending`. A migração devolve a `pending` as contas ativas sem verificação.

**Filtro por grupo na pergunta:** o agente reconhece o nome completo de uma fonte do espaço e passa `sourceIds` para a busca.

## 2. Princípios aplicados

`.reversa/principles.md` não existe neste projeto. Valem os princípios do `CLAUDE.md` e do PRD:

| Princípio | Como a feature se relaciona | Status |
|-----------|------------------------------|--------|
| WhatsApp-first, not WhatsApp-only | Comandos e confirmações no núcleo do agente, neutros quanto ao canal; o aviso usa o `sendReply` do contrato; o E2E roda pelo canal de teste e pelo WhatsApp simulado | respeita |
| Evidence over hallucination | A gestão não gera afirmação factual; o filtro por grupo só estreita a busca, e as citações continuam conferidas | respeita |
| Capture once, remember forever, respeitando retenção e exclusão | A fatia entrega a exclusão em cascata e a revogação que o princípio exige | respeita |
| Security First e Local First | Verificação de posse antes de qualquer comando; confirmação explícita para o que é destrutivo; tudo no Postgres e no armazenamento locais | respeita |
| Privacidade dos dados de terceiros (exports e conteúdo) | Auditoria, logs e métricas sem nome de grupo, telefone ou conteúdo | respeita |
| Complexidade ≤ 10 e testes de arquitetura | O reconhecimento de comandos vira uma tabela de regras pequenas; nenhuma dependência nova entre módulos fora do `index.ts` | respeita |

## 3. Decisões técnicas

| ID | Decisão | Justificativa | Alternativas descartadas | Confidência |
|----|---------|----------------|--------------------------|-------------|
| D-01 | Comandos reconhecidos por palavras fixas, no domínio do agente (`agent/domain/command.ts`), antes da busca. Gramática em `interfaces/comandos-do-agente.md` | Determinístico, testável e sem custo; segue o padrão da ajuda da S2. A classificação com LLM é da S9 | LLM para a intenção `manage_sources`; regex espalhado pelo canal | 🟢 |
| D-02 | Estado curto da conversa na tabela `agent_conversation_state`: uma linha por usuário e provedor, com a última lista (ids e nomes, até 30 min) e a ação pendente (até 5 min) | Sobrevive a reinício, vale para os processos do canal de teste e do WhatsApp e expira sem job | Memória do processo (perde no reinício e não é testável entre processos); a `AgentSession` completa (é da S7/S9) | 🟡 |
| D-03 | Serviço `createSourceManagement` no módulo `sources`: listar, acompanhar, parar, pedir exclusão e ler o catálogo de nomes. Ele envolve o `createCaptureAdmin` da S3, e o agente o usa por uma porta (`SourceManagement`) composta em `src/main` | Uma regra só para o agente e para o terminal (RN-09); o agente não conhece tabelas de captura | Duplicar a lógica no agente; o agente chamar o `captureAdmin` direto | 🟢 |
| D-04 | A lista junta o diretório `whatsapp_groups` com as fontes do espaço:<br>• grupo com captura ativa: "acompanhando";<br>• grupo com captura revogada: "parado";<br>• grupo sem captura: "não acompanhado";<br>• conversa importada sem grupo: "importada".<br>Ordem por nome e id; 30 itens por mensagem e "mais" para a próxima página | Atende a RN-03 com os dados que já existem; 55 grupos cabem em 2 mensagens | Uma mensagem só (passa do limite confortável do WhatsApp); listar só os grupos (não permitiria apagar uma importada) | 🟡 |
| D-05 | Acompanhar: o agente devolve a declaração e pede "confirmo". Apagar: exige "confirmo apagar <nome>", com o nome normalizado igual ao da ação pendente. A declaração gravada em `source_captures.consent_statement` é fixa: "Participantes informados e de acordo; confirmado pelo dono pelo agente em <data>" | O nome na confirmação de apagar evita o engano da S3; para acompanhar, o grupo já foi citado no pedido e a ação é reversível | Exigir o nome nas duas (fricção sem ganho); "sim" para apagar (fraco demais) | 🟡 |
| D-06 | Ao acompanhar, se houver uma fonte importada do espaço com o mesmo nome normalizado (`importConversationId`) e sem captura ativa, o grupo é ligado a ela, e o pedido de confirmação avisa isso | É a mesma regra do `--conversa` da S3, sem pedir nome ao usuário; a reconciliação continua dentro de uma fonte só | Perguntar sempre se quer ligar (mais um passo); nunca ligar (duplicaria a conversa) | 🟡 |
| D-07 | Confirmar a exclusão, numa transação:<br>• `sources.status = 'deleting'`;<br>• revogar a captura ativa da fonte;<br>• inserir em `source_deletions` e em `audit_events`;<br>• publicar `sources.delete` pelo outbox.<br>A busca já ignora `deleting` (`pg-search-index.ts`), e a importação já recusa (`ensure-import-source.ts`) | A fonte some das respostas na hora, e nada se perde se o worker cair | Apagar de forma síncrona na resposta (estoura os 3 s e falha sem retentativa) | 🟢 |
| D-08 | Job `sources.delete` no worker:<br>1. conta as mensagens e os áudios;<br>2. remove os objetos do prefixo `<space>/<source>/` com a nova porta `MediaPurger` (módulo `media`, `deletePrefix` com `ListObjectsV2` e `DeleteObjects` de até 1.000 chaves);<br>3. `DELETE FROM sources` (cascata das FKs da 0003 a 0007);<br>4. marca a conclusão, audita e publica `agent.notify`.<br>Retentativas: 12, com recuo exponencial a partir de 30 s (cerca de 34 h); depois, fila morta | Cada passo é idempotente; o prefixo é por fonte porque a chave do objeto é `space/source/sha256` (S4); as FKs já fazem a cascata | Apagar mensagem por mensagem (lento); `DELETE` sem a mídia (deixa arquivo órfão, contra a RNF de privacidade) | 🟡 |
| D-09 | Os jobs `media.process` e `knowledge.index` pendentes de uma fonte apagada não são removidos: os processadores já ignoram a mensagem ou o anexo que sumiu (`skipped`) | Menos código e nenhuma corrida com o pg-boss | Apagar os jobs por SQL no esquema do pg-boss (acopla à estrutura interna dele) | 🟢 |
| D-10 | Fila `agent.notify`, consumida pelo processo do canal: o WhatsApp sempre com fila, e não só com a captura ligada; a API para o canal de teste. O processo reivindica o aviso (`notified_at` de nulo para agora), manda com `sendReply(destinationAccountId)` e, se o envio falhar, devolve `notified_at` para nulo e relança. O canal de teste guarda os envios numa lista consultável pelo E2E | Um único aviso, mesmo com reentrega; nenhuma mudança no contrato do canal | O worker mandar direto (ele não tem o canal); polling da tabela pelo canal | 🟡 |
| D-11 | Verificação em `channel_account_verifications`:<br>• código de 6 dígitos;<br>• SHA-256 com sal por código e comparação em tempo constante;<br>• 10 min e até 5 tentativas;<br>• um código novo invalida o anterior.<br>`whatsapp:link` deixa a conta `pending` e mostra o código. A resolução de usuário passa a devolver o estado da conta: uma conta `pending` que manda 6 dígitos tenta verificar; qualquer outra coisa recebe a instrução | Esclarecimento de 2026-11-24 (código do terminal para o agente); RNF-02 da spec | Código mandado pelo agente (mensagem espontânea); bcrypt ou scrypt (desnecessário para um código de 10 min com 5 tentativas) | 🟢 |
| D-12 | A migração `0008` volta a `pending` as contas `active` com `verified_at` nulo, exceto as do provedor `fake`. O seed passa a gravar `verified_at` na conta do canal de teste | Esclarecimento de 2026-11-24 (RF-15); o canal de teste não tem posse a provar | Também verificar o `fake` (quebraria a API local e o E2E sem ganho) | 🟢 |
| D-13 | Tabela `audit_events` (ator, ação, tipo e id do alvo, detalhes `jsonb` só com contagens, momento), sem FK para o alvo, para sobreviver à exclusão, e sem nomes. Comando `npm run auditoria` lista os eventos e mostra o nome da fonte só enquanto ela existe. `source_captures` continua sendo a autorização da captura | RN-07 e RF-09; privacidade depois da exclusão | Auditoria só em `source_captures` (não cobre o vínculo nem a exclusão); guardar o nome (sobra PII depois de apagar) | 🟡 |
| D-14 | Filtro por grupo na pergunta (RN-11): `questionScope` recebe os nomes das fontes do espaço (catálogo de D-03) e reconhece o nome completo normalizado, ficando com o mais longo. O nome sai do texto, e a `SearchRequest` ganha `sourceIds`, com o filtro `m.source_id = ANY($6)` na consulta. Nomes repetidos fazem o agente listar as opções | Reaproveita a E001 da S4 e a porta interna de busca, sem mudar o contrato | Trecho do nome (falsos positivos em palavras comuns, como "Contas"); LLM para extrair a entidade (S9) | 🟡 |
| D-15 | Nos comandos, a referência à conversa é resolvida nesta ordem: número da última lista (com até 30 min), nome exato normalizado, trecho que identifica uma única conversa. Se houver mais de uma candidata, o agente lista as opções e não age | RN-03; EC-06 da spec do agente | Só números (ruim de lembrar); só nome exato (rígido demais para "apagar t3") | 🟢 |
| D-16 | Observabilidade:<br>• métricas `palantir_agent_commands_total{command,outcome}`, `palantir_source_deletions_in_progress` e `palantir_source_deletion_seconds`;<br>• alerta `SourceDeletionStalled`, para exclusão em andamento há mais de 30 min;<br>• painel "Gestão" no Grafana.<br>Nenhum nome ou telefone nos rótulos | RF-12; padrão dos painéis da S2 a S4 | Alerta só na fila morta (avisaria tarde demais) | 🟡 |
| D-17 | `whatsapp:grupos -- apagar <grupo> --confirmar "<nome>"` usa o mesmo serviço e só pede a exclusão; o aviso vai para a conta do dono, se houver uma verificada | RF-13 (Could), RN-09 | Comando separado de exclusão | 🟡 |
| D-18 | A ajuda ganha a seção "Seus grupos", com um exemplo de cada comando | RF-10 | Ajuda separada para gestão | 🟢 |
| D-19 | Instalação de um usuário só (v0.1): o diretório de grupos do número de captura aparece para qualquer conta verificada da instalação. Um grupo acompanhado por outro espaço aparece como "acompanhado por outra conta", sem detalhes, e não aceita comandos | Hoje existe um único usuário (seed); o conteúdo continua isolado por espaço (RN-09 da S3) | Vincular o número de captura a um dono (mudança de modelo sem uso na v0.1) | 🟡 |
| D-20 | Remetente desconhecido continua recebendo silêncio no WhatsApp. Conta `pending` recebe só a instrução de verificação e nunca chega à busca nem à gestão | RN-02; adendo 003 | Responder aos desconhecidos (risco de bloqueio) | 🟢 |

## 4. Premissas

Nenhuma premissa de `[DÚVIDA]`: as três dúvidas foram resolvidas no esclarecimento de 2026-11-24.

| Premissa | Origem (`requirements.md` seção) | Risco se errada |
|----------|----------------------------------|-----------------|
| A instalação continua com um usuário só na v0.1 (D-19) | `#4` RN-09 da S3; `identity-and-sources.md#4` NG-01 | Um segundo usuário veria os nomes dos grupos do número de captura |
| A fonte do T3 cabe no prazo de 5 min (cerca de 10.000 mensagens e 158 áudios) | `#6` Desempenho | Exclusão mais lenta; o alerta de 30 min cobre o caso |

## 5. Delta arquitetural

| Componente | Arquivo de origem no legado | Tipo de mudança | Resumo |
|------------|------------------------------|-----------------|--------|
| conversational-agent | `_reversa_sdd/sdd/conversational-agent.md` | regra-alterada | Comandos de gestão e de verificação antes da busca (D-01, D-20); estado curto (D-02); filtro por grupo na pergunta (D-14); ajuda nova (D-18) |
| identity-and-sources (identity) | `_reversa_sdd/sdd/identity-and-sources.md` | regra-alterada | Verificação por código (D-11), migração das contas ativas (D-12), resolução com o estado da conta |
| identity-and-sources (sources) | `_reversa_sdd/sdd/identity-and-sources.md` | componente-novo | Serviço de gestão (D-03, D-04, D-06, D-15), exclusão em duas etapas (D-07, D-08), auditoria (D-13) |
| media-transcription | `_reversa_sdd/addenda/005-perguntar-sobre-audios.md` | regra-alterada | Porta `MediaPurger` e `deletePrefix` no armazenamento (D-08) |
| retrieval | `_reversa_sdd/sdd/retrieval.md` | regra-alterada | `sourceIds` na `SearchRequest` (D-14) |
| whatsapp-baileys-adapter / channels | `_reversa_sdd/sdd/whatsapp-baileys-adapter.md` | regra-alterada | O processo do WhatsApp consome `agent.notify` (D-10); o canal de teste registra os envios |
| platform-foundation | `_reversa_sdd/sdd/platform-foundation.md` | componente-novo | Filas `sources.delete` e `agent.notify`, métricas, alerta e painel "Gestão" (D-16), comando `auditoria` (D-13), `whatsapp:link` com código (D-11) |

## 6. Delta no modelo de dados

- **Resumo das mudanças:** migração `0008_source_management.sql`, com:
  - quatro tabelas novas: `channel_account_verifications`, `agent_conversation_state`, `source_deletions` e `audit_events`;
  - a volta a `pending` das contas ativas sem verificação;
  - um índice em `sources (space_id)`.

  As FKs com `ON DELETE CASCADE` da 0003 a 0007 já cobrem a cascata.
- **Detalhe completo em:** `_reversa_forward/006-gerenciar-grupos-pelo-agente/data-delta.md`

## 7. Delta de contratos externos

O contrato do canal **não muda**: o aviso usa o `sendReply`, que já existe. Mudam as superfícies voltadas ao usuário e ao operador, e as filas internas:

| Contrato | Tipo | Arquivo de detalhe |
|----------|------|--------------------|
| Comandos de gestão e verificação pelo agente | mensagem (texto no canal) | `interfaces/comandos-do-agente.md` |
| `sources.delete` e `agent.notify` | fila (pg-boss) | `interfaces/jobs-exclusao-e-aviso.md` |
| `whatsapp:link` (código), `whatsapp:grupos apagar`, `auditoria` | CLI | `interfaces/cli-vinculo-grupos-auditoria.md` |

## 8. Plano de migração

1. Aplicar a `0008` (`npm run db:migrate`). A conta pessoal da S2 fica `pending`. O canal de teste não é afetado.
2. Rodar `npm run seed`, que agora grava `verified_at` no `fake`.
3. Rodar `npm run whatsapp:link -- "<número>"`, que mostra o código, e mandar o código ao agente pelo WhatsApp em até 10 min. A conta volta a `active` com `verified_at`.
4. Subir o worker e o canal: as filas novas são criadas na subida.
5. Reverter: a migração `0008` tem o bloco de descida, que remove as tabelas novas. Ela não restaura o `active` das contas, e para isso basta rodar o `whatsapp:link` de novo. O código da S4 continua compatível.

## 9. Riscos e mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| Apagar a conversa errada | Média | Alto | Confirmação com o nome (D-05), lista que expira em 30 min, ambiguidade sem ação (D-15), auditoria |
| O usuário fica sem acesso depois da migração | Alta (esperado) | Médio | `onboarding.md` começa pela verificação; a resposta à conta `pending` explica o que fazer |
| Arquivo de mídia órfão depois da exclusão | Baixa | Alto (privacidade) | Purga por prefixo antes do `DELETE` e retentativa de até 34 h; `media:conferir` passa a contar objetos sem fonte |
| Aviso duplicado ou perdido | Baixa | Baixo | Reivindicação por `notified_at` com devolução em caso de falha (D-10) |
| Mensagem ao vivo chega entre a confirmação e o `DELETE` | Média | Baixo | A ingestão recusa fonte `deleting`; o que entrar antes some na cascata |
| Bloqueio do número por mensagem espontânea | Baixa | Alto | Só o aviso de exclusão, a pedido do próprio usuário (RN-08) |
| Filtro por grupo reconhecer um nome comum como grupo | Média | Baixo | Só o nome completo; o nome repetido lista as opções (D-14) |

## 10. Critério de pronto

- [ ] Os cenários de `requirements.md#7` passam no E2E, pelo canal de teste e pelo WhatsApp simulado.
- [ ] A exclusão de uma fonte com 10.000 mensagens e 200 áudios termina em até 5 min, sem nenhum objeto restante no SeaweedFS.
- [ ] A conta pessoal fica `pending` depois da migração e volta a `active` com o código do `whatsapp:link`.
- [ ] O painel "Gestão" e o alerta `SourceDeletionStalled` foram validados pelo `promtool`.
- [ ] Os 7 jobs da esteira estão verdes: tipos, lint com complexidade ≤ 10, arquitetura, contratos, unitários, integração, E2E, mutação ≥ 60% e segurança.
- [ ] A demonstração foi feita com o chip: verificar, listar, acompanhar, parar, apagar um grupo de teste descartável e perguntar citando o grupo.

## 11. Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-11-24 | Versão inicial gerada por `/reversa-plan` | reversa |
