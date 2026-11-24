# Actions: Perguntar sobre o que foi dito em áudios (fatia S4)

> Identificador: `005-perguntar-sobre-audios`
> Data: `2026-11-23`
> Roadmap: `_reversa_forward/005-perguntar-sobre-audios/roadmap.md`

## Resumo

| Métrica | Valor |
|---------|-------|
| Total de ações | 21 |
| Paralelizáveis (`[//]`) | 12 |
| Maior cadeia de dependência | 6 (T003 → T005 → T010 → T011 → T017 → T018) |

**Prática:** TDD. O teste de integração do caminho de mídia (Fase 2) vem antes da implementação. As demais ações escrevem o teste antes do código, no mesmo bloco. Todos os testes automáticos usam o motor falso e áudios sintéticos. O motor real só aparece no spike (T001), na medição (T019) e na demonstração.

**Tamanho:** 21 ações, acima das ~15 da regra das fatias e das ~18 estimadas no roadmap (R-07). Fica uma fatia só, como combinado. Se for preciso dividir, a S4b leva:
- T015 e T016;
- a parte "ao vivo" de T017 e T018;
- a reconciliação de áudio de T010.

Todo o resto continua na S4a, sem mudar IDs.

## Fase 1, Preparação

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T001 | **Spike do motor (D-10).**<br>• Módulo Terraform `transcriber`: `ghcr.io/speaches-ai/speaches:0.8.3-cpu`, `127.0.0.1:8090` → 8000, volume do cache de modelos, limite de 4 GB, int8. Ligado em `infra/local/main.tf`, com output `transcriber_url`.<br>• Com um áudio público do FLEURS ou sintético (nunca real), verificar: campos do `verbose_json` (`segments[].start/end/text`, `language`, `duration`); aceite de `audio/ogg` Opus; mecanismo de download de modelos (`POST /v1/models/{id}` ou `PRELOAD_MODELS`); ids de `small`, `medium` e `large-v3-turbo` no registro.<br>• Registrar o resultado nas Notas de execução. Se algum ponto falhar, trocar para o whisper.cpp (reserva da D-07) antes da T008. | - | `[//]` | `infra/modules/transcriber/main.tf` | 🟡 | `[X]` |
| T002 | **Configuração da mídia e da transcrição** em `config.ts`:<br>• variáveis `PALANTIR_TRANSCRIPTION`, `PALANTIR_TRANSCRIBER`, `_URL`, `_MODEL`, `_ALLOW_REMOTE`, `_API_KEY`, `PALANTIR_TRANSCRIBE_CONCURRENCY`, `PALANTIR_MEDIA_STORE_KINDS` e `PALANTIR_MEDIA_KEY`;<br>• URL fora de loopback recusada sem `ALLOW_REMOTE`; chave de 32 bytes; mensagens sem o valor.<br>Também: `.env.example`; `scripts/env-file.mjs` gera e preserva `PALANTIR_MEDIA_KEY` e preserva `_MODEL` e `_TRANSCRIPTION`. Testes da configuração e do merge do `.env`. | - | `[//]` | `src/platform/config.ts` | 🟢 | `[X]` |
| T003 | **Migração `0007_media.sql`** conforme o `data-delta.md`:<br>• `attachments`, com `UNIQUE (message_id)`, índice (`source_id`, `sha256`) e índice parcial de `pending`;<br>• `transcripts`, com uma ativa por anexo;<br>• `transcript_segments`;<br>• `message_chunks.audio_start_s` e `audio_end_s`, com CHECK;<br>• `down` simétrico.<br>Teste de integração: segunda transcrição ativa recusada; cascata ao apagar a mensagem; CHECK da faixa de tempo. | - | `[//]` | `migrations/0007_media.sql` | 🟢 | `[X]` |
| T004 | **Contrato do canal 1.3.0** (`interfaces/contrato-canal-midia.md`):<br>• `canonical-message.schema.json`: o anexo ganha `sha256`, `durationSeconds`, `status` e `unavailableReason`; `kind = audio` exige anexo;<br>• `agent-reply.schema.json`: a `Citation` ganha `kind`, `audioStartS` e `audioEndS`;<br>• `knowledge-channel.ts`: `fetchMedia`, `MediaContent`, `MediaUnavailableError` e `CONTRACT_VERSION = "1.3.0"`;<br>• `npm run contracts:generate`.<br>Testes do schema (casos válidos e inválidos) e `contracts:check` verde. | - | `[//]` | `contracts/channel/canonical-message.schema.json` | 🟢 | `[X]` |
## Fase 2, Testes

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T005 | **Teste de integração vermelho do caminho de mídia**, com PostgreSQL e SeaweedFS reais e o motor falso. Cenários:<br>• áudio sintético ingerido com anexo guardado gera 1 objeto cifrado e 1 job `media.process`;<br>• processar grava a transcrição ativa, os segmentos e os trechos com faixa de tempo, e a busca acha a palavra;<br>• o mesmo binário por captura e importação dá 1 objeto e 1 mensagem `reconciled`;<br>• duração de 90 min dá `too_long`; Ogg inválido dá `failed`/`corrupted` sem nova tentativa;<br>• job `live` publicado depois de 5 `export_import` é entregue antes. | T003, T004 | - | `test/integration/media-pipeline.test.ts` | 🟡 | `[X]` |
## Fase 3, Núcleo

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T006 | **Domínio de `media`:**<br>• `ogg-duration.ts`: granulo da última página menos o pre-skip, sobre 48 kHz; erro tipado para Ogg inválido;<br>• `media-policy.ts`: tipo da mídia pelo MIME e pela extensão, tipos a guardar e tipos com processador, limite de 64 MB, limite de 3.600 s;<br>• `wer.ts`: normalização e distância de edição por palavras, ignorando `[?]`;<br>• `format-duration.ts`: `m:ss` e `h:mm:ss`.<br>Testes unitários com Ogg sintético (cabeçalhos montados no teste) e casos-limite. | - | `[//]` | `src/modules/media/domain/ogg-duration.ts` | 🟢 | `[X]` |
| T007 | **Armazenamento de objetos:**<br>• `@aws-sdk/client-s3` fixado;<br>• envelope AES-256-GCM (versão, IV, cifra, tag);<br>• `putIfAbsent` endereçado pelo conteúdo (`HEAD` e depois `PUT`) e `get` que decifra;<br>• regras do dependency-cruiser `object-store-isolated`, `transcriber-engine-isolated` e `media-no-channels`.<br>Testes unitários do envelope (tag adulterada falha). Teste de integração contra o SeaweedFS: sem credencial, 403; o mesmo conteúdo, 1 objeto. | T002 | `[//]` | `src/modules/media/infrastructure/object-store/s3-object-store.ts` | 🟢 | `[X]` |
| T008 | **Porta `Transcriber` e adaptadores** (`interfaces/transcriber.md`):<br>• `ports.ts`;<br>• `openai-compatible.ts`: multipart com nome de arquivo fixo, mapeamento do `verbose_json` confirmado na T001, erros por HTTP, prazo de 3× a duração com mínimo de 120 s, guarda de loopback, `health()`;<br>• `fake.ts`: segmentos determinísticos lidos de um roteiro embutido no áudio sintético.<br>Testes com um servidor HTTP local de mentira (`node:http`). | T001, T002 | `[//]` | `src/modules/media/infrastructure/transcribers/openai-compatible.ts` | 🟡 | `[X]` |
| T009 | **`prepareAttachments(message, fetch)`:**<br>• para tipo fora da política, devolve como hoje;<br>• baixa pela `fetchRef` com 3 tentativas (1, 2 e 4 s);<br>• aplica o limite de tamanho;<br>• calcula o SHA-256 e a duração (Ogg ou a informada);<br>• grava pelo armazenamento;<br>• preenche `status`, `storageKey`, `sha256` e `durationSeconds`, ou `unavailable` com o motivo.<br>Testes unitários com armazenamento e `fetch` em memória, incluindo falha transitória e falha definitiva. | T004, T006, T007 | - | `src/modules/media/application/prepare-attachments.ts` | 🟢 | `[X]` |
| T010 | **Ingestão com anexos:**<br>• a porta do store grava `attachments`;<br>• `ingest-message` publica `media.process` na mesma transação (prioridade 10 `live` e 0 `export_import`; `singletonKey` = anexo) quando o anexo está guardado e tem processador; senão, `not_applicable`;<br>• reconciliação de áudio por mesma fonte, `kind = audio`, até 60 s e mesmo `sha256`, com `FOR UPDATE` (D-16);<br>• recusa como `invalid` anexo sem `status`.<br>Testes unitários. A parte de ingestão da T005 fica verde. | T003, T004, T005 | - | `src/modules/ingestion/application/ingest-message.ts` | 🟡 | `[X]` |
| T011 | **`processAttachment`** (`interfaces/job-media-process.md`, passos 1 a 7):<br>• registro de processadores por tipo; processador de áudio pelo `Transcriber`;<br>• `pg-media-repository.ts`: anexo, transcrição versionada com segmentos, status e outbox de `knowledge.index`;<br>• varredura de anexos `pending` sem job;<br>• exportar pelo `index.ts` de `media`.<br>Testes unitários com o motor falso, cobrindo `done`, `empty`, `too_long`, `corrupted`, nova tentativa e job repetido idempotente. A parte de processamento da T005 fica verde. | T008, T010 | - | `src/modules/media/application/process-attachment.ts` | 🟢 | `[X]` |
| T012 | **Indexação com áudio:**<br>• `loadMessage` traz os segmentos da transcrição ativa;<br>• blocos de até ~400 caracteres sem quebrar segmento, cada um com `audio_start_s` e `audio_end_s`; trecho 0 com o texto ou a legenda;<br>• reindexar substitui todos os trechos da mensagem, apagando os que sobraram.<br>Testes unitários do agrupamento. Teste de integração do `pg-chunk-repository`. | T003 | `[//]` | `src/modules/knowledge/application/index-message.ts` | 🟢 | `[X]` |
| T013 | **Busca e resposta de áudio:**<br>• `Evidence` ganha `kind`, `audioStartS`, `audioEndS` e `durationSeconds` (consulta com `attachments`);<br>• `composeAnswer` formata `áudio de m:ss, aos m:ss` e preenche `Citation.kind` e a faixa; sem duração, omite "áudio de";<br>• texto e limite de 3 citações sem mudança.<br>Testes unitários de formatação e um teste de integração da busca que devolve a faixa. | T004, T006, T012 | - | `src/modules/agent/domain/answer.ts` | 🟢 | `[X]` |
## Fase 4, Integração

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T014 | **Importação de áudios** (D-17):<br>• `parse.ts` guarda o nome de referência do anexo e classifica áudio pela extensão;<br>• `importer.ts`: mensagem `kind = audio` com chave sobre o nome de referência; `fetch` lendo a entrada do ZIP; `prepareAttachments`; ausente vira `missing_in_export`; áudio com legenda continua texto;<br>• relatório com as linhas de áudio e "Outras mídias";<br>• `import.ts` monta o armazenamento e trata os erros de chave e de armazenamento.<br>Testes unitários com ZIP sintético. `real-exports.test.ts` confere 158 áudios vinculados no T3, só contagens. | T009, T010 | - | `src/channels/whatsapp-export/importer.ts` | 🟢 | `[X]` |
| T015 | **Provedor do WhatsApp com áudio:**<br>• `IncomingGroupMessage.media` (tipo, MIME, `seconds`, tamanho, `fetchRef`);<br>• `downloadMedia` no `baileys-provider.ts` via `downloadMediaMessage`, com mapa de mensagens cruas limitado a 500 itens e 15 min;<br>• o simulador ganha `deliverGroupAudio` e o modo "falhar N downloads".<br>Testes unitários do mapa (expiração e limite) e do mapeamento de `audioMessage`. | T004 | `[//]` | `src/channels/whatsapp/provider/baileys-provider.ts` | 🟢 | `[X]` |
| T016 | **Canal com mídia:**<br>• `whatsapp-channel.ts` declara `supportsMedia: true` e implementa `fetchMedia`;<br>• `capture.ts`: áudio de grupo autorizado e posterior à autorização vira `CanonicalMessage` `kind = audio` com `fetchRef`; outros tipos seguem contados e descartados;<br>• o canal falso ganha `fetchMedia`;<br>• a suíte de contrato roda os testes de mídia para `fake` e para o WhatsApp simulado.<br>Testes unitários da captura. | T015 | - | `src/channels/whatsapp/capture.ts` | 🟢 | `[X]` |
| T017 | **Composição:**<br>• o tratador de entrada do WhatsApp passa a "preparar anexos e depois ingerir";<br>• o worker assina `media.process` com `localConcurrency` e respeita `PALANTIR_TRANSCRIPTION=off`;<br>• varredura na partida, sondagem de saúde do motor e escolha do `Transcriber` por configuração (`fake` nos testes);<br>• a importação recebe armazenamento e política.<br>Testes de composição (configuração inválida falha cedo, sem vazar pool). | T011, T013, T014, T016 | - | `src/main/compose.ts` | 🟢 | `[X]` |
| T018 | **E2E da S4**, com motor falso e provedor simulado:<br>• importar um ZIP sintético com áudio; a pergunta cita o áudio com duração e ponto;<br>• áudio em grupo autorizado é respondido; em grupo não autorizado, nada é baixado;<br>• o mesmo áudio por importação e ao vivo dá 1 citação;<br>• áudio ausente no ZIP é contado;<br>• transcrição desligada deixa o anexo `pending` e respostas de texto normais;<br>• logs sem texto transcrito, sem `PTT-` e sem telefone. | T017 | - | `test/e2e/media-audio.test.ts` | 🟢 | `[X]` |
| T019 | **Comandos de medição e de operação** (`interfaces/cli-importacao-e-medicao.md`):<br>• `eval:transcricao`: `preparar` (sorteio determinístico e estratificado, sem sobrescrever `.txt` preenchido), `fleurs` (download retomável e conferência de tamanho) e `medir` (WER, tempo real e memória pelo `docker stats`, gravando `resultado-<data>.json` só com números);<br>• `transcricao:modelos`;<br>• `media:conferir`;<br>• scripts no `package.json`.<br>Testes unitários da seleção, da tabela e de que a saída não contém texto. | T006, T007, T008 | `[//]` | `scripts/eval-transcricao.ts` | 🟡 | `[X]` |
## Fase 5, Polimento

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| T020 | **Observabilidade** (D-20):<br>• métricas `media_*`, `transcription_rtf`, `transcription_latency_seconds` e `transcriber_up`;<br>• trace do job com os atributos do motor;<br>• painel "Mídia" no Grafana;<br>• alertas `TranscriptionQueueStalled` e `TranscriberDown` validados com `promtool`.<br>Testes unitários do observador. | T017 | `[//]` | `infra/local/config/grafana/dashboards/media.json` | 🟢 | `[X]` |
| T021 | **Documentação:**<br>• ADR-0010 (transcrição local e substituível, Speaches, cifra na aplicação, chave pelo conteúdo), com a seção "Medição" a preencher com a tabela do `eval:transcricao`;<br>• nota na ADR-0004 (contrato 1.3.0);<br>• README, CLAUDE.md e AGENTS.md (comandos e estado da S4);<br>• `docs/plano-de-fatias.md`: S4 🔄 e linha no histórico. | T017 | `[//]` | `docs/adr/0010-transcricao-local-substituivel.md` | 🟢 | `[X]` |
## Notas de execução

- **T001 (spike do motor, 2026-11-23):** Speaches `0.8.3-cpu` no ar em `127.0.0.1:8090`. Teste com fala sintética em pt-BR (voz do Windows, 16 s, convertida para Ogg/Opus de 24 kbps com o ffmpeg do próprio container); nenhum áudio real.
  - `POST /v1/audio/transcriptions` com `response_format=verbose_json` devolve `language` (código ISO, `pt`), `duration`, `text` e `segments[]` com `start`, `end` e `text` (mais campos que ignoramos: `words`, `avg_logprob`, `no_speech_prob`). Os 2 segmentos cobriram os 16 s.
  - Ogg/Opus é aceito direto, sem conversão.
  - Erros: arquivo inválido → `415` "Failed to decode audio" (vira `corrupted`); modelo não baixado → `404` "is not installed locally" (vira `engine_failed`, com a dica de download).
  - Download de modelos: `POST /v1/models/{id}` → `200` "Model ... downloaded" (o `small` levou 28 s).
  - Ids no registro: `Systran/faster-whisper-small`, `Systran/faster-whisper-medium` e `deepdml/faster-whisper-large-v3-turbo-ct2`.
  - Velocidade, só como sinal: com o `small` já carregado, 16 s de áudio em 4,5 s (tempo real ~0,28). A primeira chamada levou 8 s, por carregar o modelo.
  - Decisão: segue o Speaches (D-07); a reserva do whisper.cpp não é necessária.

- **T014 (importação):** o T3 real tem 158 áudios; todos vinculados ao arquivo do ZIP, nenhum ausente (`real-exports.test.ts`, só contagens). `<Mídia oculta>` não diz o tipo e continua em "Outras mídias", como previsto na D-17.
- **T017 (composição):** em vez de falhar a partida, o worker e a captura **degradam com aviso** quando falta a chave de mídia ou o armazenamento: a captura volta a contar e descartar áudio, e o worker não assina `media.process` (os anexos ficam `pending`). Motivo: o processo do WhatsApp e o worker continuam úteis para texto, e o setup resolve a falta. A importação, ao contrário, recusa antes de gravar ("Nada foi importado"), porque ali o operador está presente.
- **T018 (E2E):** o ponto citado é o início do bloco da transcrição (D-14, blocos de até ~400 caracteres); num áudio curto, é o início do áudio ("aos 0:00"). A precisão é a do bloco, não a da palavra, como descrito no onboarding.

## Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-11-23 | Versão inicial gerada por `/reversa-to-do` | reversa |

## Emendas

| ID | Descrição | Dependências | Paralelismo | Arquivo alvo | Confidência | Status |
|----|-----------|--------------|-------------|--------------|-------------|--------|
| E001 | "Em qual áudio..." busca só entre áudios, sem usar "áudio" como termo; sem áudio, avisa | - | - | `src/modules/agent/domain/question.ts` | 🟢 | `[X]` |
