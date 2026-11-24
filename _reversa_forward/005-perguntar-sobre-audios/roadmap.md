# Roadmap: Perguntar sobre o que foi dito em áudios (fatia S4)

> Identificador: `005-perguntar-sobre-audios`
> Data: `2026-11-23`
> Requirements: `_reversa_forward/005-perguntar-sobre-audios/requirements.md`
> Confidência: 🟢 CONFIRMADO, 🟡 INFERIDO, 🔴 LACUNA

## 1. Resumo da abordagem

Nasce o módulo `media` (previsto em `platform-foundation.md#6`, RF-03). Ele cuida do caminho do anexo, igual para qualquer tipo de mídia:
1. **Preparar:** o anexo chega por uma `fetchRef`, que é o download do WhatsApp ou a entrada do ZIP.
2. **Guardar:** o binário é cifrado com AES-256-GCM e gravado no SeaweedFS, que já está provisionado. O endereço é pelo conteúdo, `<space>/<source>/<sha256>`.
3. **Registrar:** a ingestão grava o anexo junto da mensagem e, na mesma transação, publica o job `media.process`.
4. **Processar:** o worker escolhe o processador pelo tipo do anexo. Nesta fatia só existe o de áudio, que chama a porta `Transcriber`, grava a transcrição versionada com segmentos e publica `knowledge.index`.
5. **Indexar:** a indexação gera trechos da transcrição com a faixa de tempo, a busca devolve a faixa e o agente compõe a citação de áudio.

O motor padrão é o Whisper em CPU (faster-whisper, int8), servido pelo Speaches num container que o `npm run setup` sobe. A API dele é compatível com a da OpenAI. Um único adaptador HTTP "compatível com OpenAI" fala com o Speaches e, no futuro, pode falar com um serviço SaaS que use a mesma API. Só a configuração muda, e um endereço fora da máquina exige liberação explícita. Outro motor com outra API é só mais um adaptador.

A escolha do modelo sai de um comando de medição, com dois conjuntos: áudios reais do T3 transcritos à mão pelo usuário e uma amostra do FLEURS pt-BR.

## 2. Princípios aplicados

`.reversa/principles.md` não existe neste projeto. Valem os princípios de produto e engenharia do `CLAUDE.md` e do `_reversa_sdd/prd.md`.

| Princípio | Como a feature se relaciona | Status |
|-----------|------------------------------|--------|
| WhatsApp-first, not WhatsApp-only | O canal só oferece `fetchMedia`. Guardar e transcrever ficam no núcleo (`media`), iguais para captura e importação. A suíte de contrato ganha os testes de mídia | respeita |
| Evidence over hallucination | A citação de áudio aponta a mensagem, a faixa de tempo e o trecho transcrito. A transcrição é derivada e versionada, e a mensagem continua imutável | respeita |
| Capture once, remember forever | O áudio original é guardado, endereçado pelo conteúdo e reconciliado entre captura e importação. Pode ser transcrito de novo depois. Exclusão e retenção continuam para a S5 | respeita, com pendência conhecida |
| Security First, Local First, privacidade | Bucket privado com cifra na aplicação e chave gerada pelo setup. Motor local por padrão; motor remoto só com liberação explícita. Logs sem texto transcrito, sem nome de arquivo e sem telefone | respeita |
| Documentation e API First | Porta `Transcriber`, job `media.process`, contrato 1.3.0 e comandos descritos em `interfaces/` antes do código | respeita |
| TDD, pirâmide, complexidade ≤ 10, testes de arquitetura | Duração do Ogg, política de mídia, WER e formato da citação no domínio (cobertos por mutação). Motor falso nos testes. Regras novas no dependency-cruiser | respeita |
| KISS e YAGNI | Só áudio é guardado e processado. O registro de processadores é um mapa por tipo, sem plugin dinâmico. Retranscrição e URL temporária ficam fora | respeita |
| Fatias de ~15 ações | A fatia é maior que a S3 (importação, captura, armazenamento, motor, medição e resposta). Ver o risco R-07 e a opção de dividir em `/reversa-to-do` | atenção |

## 3. Decisões técnicas

| ID | Decisão | Justificativa | Alternativas descartadas | Confidência |
|----|---------|----------------|--------------------------|-------------|
| D-01 | Novo módulo `src/modules/media/{domain,application,infrastructure}`, com API pública em `index.ts`: preparar anexos, processar anexo, porta `Transcriber`, registro de processadores e política de mídia | Previsto em `platform-foundation.md#6` (RF-03); mantém ingestão e conhecimento sem saber de bytes | Dentro de `ingestion` (mistura evidência com binário); dentro de `knowledge` (indexação não deve saber de motor) | 🟢 |
| D-02 | **Caminho comum de anexo** (RN-10, RF-15). `prepareAttachments(message, fetch)` baixa pela `fetchRef`, calcula o SHA-256, mede a duração quando o tipo permite, cifra, grava e devolve o anexo com `storageKey`, `sha256` e `durationSeconds`. Tipos fora de `PALANTIR_MEDIA_STORE_KINDS` (padrão `audio`) seguem como hoje: contados e descartados | Ligar imagem ou documento passa a ser configuração. Processar passa a ser um processador novo, sem migração nem mudança de fluxo | Fluxo específico de áudio (refazer para cada tipo); guardar tudo já (dado de terceiro sem uso, recusado no esclarecimento) | 🟢 |
| D-03 | **O núcleo baixa, não o canal.** O `KnowledgeChannel` ganha `fetchMedia(fetchRef)` (contrato 1.3.0). O `main` compõe o tratador de entrada como "preparar anexos e depois ingerir". O importador usa o mesmo `prepareAttachments`, com um `fetch` que lê a entrada do ZIP | Segue `channel-contract.md#6.3`, fluxo A. Um único caminho para captura e importação, testável com o canal falso | O canal grava no storage (cada adaptador repetiria cifra e hash); a ingestão baixa (a transação ficaria segurando I/O de rede) | 🟢 |
| D-04 | Chave do objeto endereçada pelo conteúdo: `<space_id>/<source_id>/<sha256>`. O upload é idempotente: o objeto que já existe não é regravado | Atende à RF-02 da spec por construção (mesmo áudio por captura e importação = 1 objeto). Dispensa conhecer o `message_id` antes da reconciliação | `space/source/message/attachment` da spec (`media-transcription.md` RF-01): exige o id final antes do upload e duplica o objeto na reconciliação | 🟢 |
| D-05 | Cifra na aplicação: AES-256-GCM com `PALANTIR_MEDIA_KEY` (32 bytes em base64), gerada e preservada pelo `npm run setup` como `PALANTIR_WA_SESSION_KEY`. Formato: versão (1 byte), IV de 12 bytes, texto cifrado e tag de 16 bytes. Limite de 64 MB por anexo, cifrado em memória | RNF-03 da spec sem depender do suporte a SSE do SeaweedFS. Padrão já testado na sessão do WhatsApp (S2) | SSE-S3 ou SSE-C do SeaweedFS (suporte e gestão da chave menos claros); sem cifra (descumpre a RNF) | 🟢 |
| D-06 | Cliente S3: `@aws-sdk/client-s3` (versão fixada), importado só em `src/modules/media/infrastructure/object-store/**` (nova regra `object-store-isolated`). As credenciais `S3_*` já estão no `.env` | SDK oficial, compatível com o SeaweedFS, mantido e com avisos de segurança acompanhados pelo OSV | Assinatura SigV4 à mão com `fetch` (código de segurança caseiro); MinIO SDK (outro fornecedor) | 🟢 |
| D-07 | **Motor de transcrição:** container `ghcr.io/speaches-ai/speaches:0.8.3-cpu` (faster-whisper e CTranslate2 em CPU), num novo módulo Terraform `transcriber`:<br>• porta `127.0.0.1:8090` → 8000;<br>• volume do cache de modelos;<br>• limite de 4 GB de memória;<br>• `compute_type=int8`.<br>A tag `0.8.3-cpu` existe no registro e foi baixada em 2026-11-23 (3,04 GB). | API compatível com OpenAI (o mesmo adaptador servirá a um SaaS). Não exige ffmpeg nem build na máquina (RNF de portabilidade). O faster-whisper int8 é a opção de CPU mais citada para o Whisper | whisper.cpp server (`ghcr.io/ggml-org/whisper.cpp`, API própria `/inference`, modelos ggml baixados à mão): reserva se o Speaches falhar na verificação. transformers.js no Node (mais lento em CPU, pesa o worker). Python dentro do projeto (segunda linguagem e ambiente) | 🟡 |
| D-08 | **Porta `Transcriber`:**<br>• `transcribe(audio, { mimeType, language, durationHint })` devolve `{ engine, model, modelVersion, language, durationSeconds, text, segments[] }`;<br>• `health()`.<br>Adaptadores: `openai-compatible` (HTTP `POST /v1/audio/transcriptions`, multipart, `response_format=verbose_json`, `timestamp_granularities[]=segment`) e `fake` (testes). A configuração escolhe por `PALANTIR_TRANSCRIBER` | RN-03 e RF-07: trocar o modelo ou o motor é configuração ou adaptador novo. A medição (RF-11) usa a mesma porta | Chamar o motor direto do processador (acopla); SDK da OpenAI (dependência grande para um POST) | 🟢 |
| D-09 | **Guarda de motor remoto:** o adaptador recusa `PALANTIR_TRANSCRIBER_URL` fora de loopback sem `PALANTIR_TRANSCRIBER_ALLOW_REMOTE=true`. `PALANTIR_TRANSCRIBER_API_KEY` é opcional (vazio no local). Ligar o remoto registra um aviso no log da partida, sem segredos | RN-03: o áudio só sai da máquina por escolha explícita | Sem guarda (um erro de configuração vaza áudio); SaaS fora do escopo de design (o usuário pediu para estar preparado) | 🟢 |
| D-10 | **Verificação do motor na primeira ação de coding** (spike curto, com um áudio sintético e nada real):<br>• `verbose_json` com `segments[].start/end/text`, `language` e `duration`;<br>• aceite de `audio/ogg` (Opus) sem conversão;<br>• download dos modelos (`POST /v1/models/{id}` ou `PRELOAD_MODELS`);<br>• ids dos modelos `small`, `medium` e `large-v3-turbo` no registro do Speaches.<br>O resultado fica nas notas de execução. Se algo falhar, a reserva é o adaptador do whisper.cpp (D-07), com a mesma porta | A documentação lida não confirmou esses quatro pontos (`investigation.md`). A sondagem local foi bloqueada nesta sessão | Assumir sem verificar (risco de refazer o adaptador) | 🟡 |
| D-11 | **Duração antes de transcrever:**<br>• Ogg/Opus: posição de granulo da última página menos o pre-skip do `OpusHead`, dividido por 48.000, num parser puro em `media/domain/ogg-duration.ts`;<br>• ao vivo: o `seconds` que o WhatsApp informa, conferido com o Ogg;<br>• outros formatos de áudio: duração desconhecida até a transcrição, que devolve `duration`; o limite de tamanho (64 MB) segura o abuso. | RN-06 (`too_long` sem gastar 1 h de CPU) e a duração na resposta (RN-05), sem ffmpeg | ffprobe (instalação manual); transcrever para descobrir (desperdício em 90 min) | 🟢 |
| D-12 | **Job `media.process`** no pg-boss, com payload `{ attachmentId, spaceId }`:<br>• prioridade 10 para captura ao vivo e 0 para importação (opção `priority` do pg-boss);<br>• `retryLimit` 3 com backoff;<br>• expiração de 3× a duração, mínimo de 120 s;<br>• `localConcurrency` por `PALANTIR_TRANSCRIBE_CONCURRENCY` (padrão 1).<br>Arquivo corrompido (Ogg inválido ou 4xx de decodificação do motor) falha sem nova tentativa. Com `PALANTIR_TRANSCRIPTION=off`, o worker não assina a fila: os jobs esperam e os anexos ficam `pending` (RF-14) | RN-07 e RF-10 com a fila que já existe (ADR-0003). O nome genérico serve a outros tipos depois | Fila separada por tipo (mais filas sem ganho); `media.store` mais `media.transcribe` da spec (o armazenamento já é síncrono na preparação, D-03) | 🟢 |
| D-13 | **Transcrição versionada:**<br>• `transcripts` (motor, modelo, versão, idioma, texto, vazio, ativa) e `transcript_segments`;<br>• uma ativa por anexo (índice único parcial);<br>• gravar uma nova desativa a anterior na mesma transação e publica `knowledge.index` junto (outbox).<br>Transcrição sem texto, ou só com ruído, fica `empty`, e a mensagem não é indexada | RN-03; `media-transcription.md#9` | Sobrescrever (perde a versão); guardar só o texto sem segmentos (sem faixa de tempo) | 🟢 |
| D-14 | **Indexação com áudio:**<br>• a mensagem gera o trecho 0 com o texto ou a legenda, como hoje, e trechos da transcrição ativa;<br>• os segmentos são agrupados em blocos de até ~400 caracteres sem quebrar segmento, cada um com `audio_start_s` e `audio_end_s`;<br>• reindexar substitui todos os trechos da mensagem, apagando os que sobraram. | `knowledge-indexing.md#6` RF-01 e `#9`. Blocos curtos dão um ponto do áudio preciso e um trecho legível na citação | Um trecho por segmento (frases soltas, busca pior); a transcrição inteira num trecho (sem ponto do áudio) | 🟢 |
| D-15 | **Busca e resposta:**<br>• a `Evidence` ganha `kind`, `audioStartS`, `audioEndS` e `durationSeconds` (junção com `attachments`);<br>• o `composeAnswer` formata o áudio como `Ana em T3, 12/11/2026, áudio de 1:42, aos 0:37: “…trecho…” [1]`;<br>• a `Citation` ganha `kind`, `audioStartS` e `audioEndS` opcionais (contrato 1.3.0, aditivo);<br>• o limite de 3 citações e `bestPerMessage` não mudam (o melhor trecho de cada áudio). | RN-05 e RF-09; ADR-0007 (compositor determinístico) | Mandar o arquivo do áudio (adiado para a S7 no esclarecimento); listar todos os trechos do mesmo áudio (resposta longa) | 🟢 |
| D-16 | **Reconciliação de áudio** (RN-04), na `ingestion`. Para `kind = audio` sem a própria chave na fonte, o candidato precisa de:<br>• mesma fonte;<br>• `kind = audio`;<br>• diferença de até 60 s;<br>• mesmo `sha256` do anexo;<br>• a chave do outro caminho vazia.<br>O candidato é travado com `FOR UPDATE`, como na S3. Sem hash (download falhou), não há reconciliação | O texto não serve para comparar áudio. O arquivo do export é o mesmo arquivo baixado pelo WhatsApp, a verificar na demonstração (R-02) | Duração com tolerância (falsos positivos entre áudios curtos); só o horário (idem) | 🟡 |
| D-17 | **Importação de áudios:**<br>• a entrada de anexo cuja referência termina em extensão de áudio (`opus`, `ogg`, `oga`, `m4a`, `mp3`, `aac`, `amr`, `wav`) vira mensagem `kind = audio`, com a chave de importação calculada sobre o nome do arquivo de referência (estável em reimportações);<br>• arquivo presente no ZIP: anexo guardado;<br>• arquivo ausente, ou importação de `.txt` puro: anexo `unavailable`;<br>• `<Mídia oculta>` não diz o tipo e continua contada como mídia, como hoje;<br>• áudio com legenda continua mensagem de texto, pelo adendo do bug #6, e o arquivo não é vinculado nesta fatia (contado à parte no relatório). | RF-01, RF-02 e RN-08, com idempotência da S1 (`keys.ts`). A mensagem é imutável (trigger da 0003), então a legenda já gravada como texto não vira áudio | Classificar `<Mídia oculta>` como áudio (falso); mudar o `kind` de mensagens já gravadas (proibido pela imutabilidade) | 🟢 |
| D-18 | **Captura ao vivo de áudio:**<br>• o provedor Baileys passa a reportar `media: { kind, mimeType, seconds?, sizeBytes? }` nas mensagens de grupo e guarda a mensagem crua num mapa limitado (500 itens, 15 min) para `downloadMedia(fetchRef)` via `downloadMediaMessage`, só no `baileys-provider.ts`;<br>• a ordem de filtros da S3 continua: não autorizado e anterior à autorização são descartados antes de qualquer download;<br>• áudio autorizado passa por `prepareAttachments`, com 3 tentativas de download (1, 2 e 4 s), depois `unavailable`;<br>• outros tipos continuam contados e descartados. | RF-03, RN-01; `whatsapp-baileys-adapter.md#6` RF-06 e `#11` EC-02. A biblioteca continua isolada (`whatsapp-lib-isolated`) | Baixar na entrega da mensagem, antes da autorização (viola a RF-05 do adaptador) | 🟢 |
| D-19 | **Comando de medição** `npm run eval:transcricao`:<br>• `preparar` sorteia, de forma determinística, 20 áudios de 10 a 120 s do export indicado e extrai para `exports/medicao/real/NN.opus`, com `NN.txt` vazio e `LEIA-ME.txt` com as regras de transcrição;<br>• `fleurs` baixa `test.tsv` e `audio/test.tar.gz` do FLEURS pt-BR (621 MB, CC BY 4.0, sem login) para `exports/medicao/fleurs/` e escolhe 50 frases fixas por semente;<br>• `medir --modelos ...` roda cada modelo pela porta `Transcriber` e imprime, por conjunto, o fator de tempo real, o WER (normalização própria, igual para todos) e o pico de memória do container (`docker stats`).<br>Tudo fica fora do git e nenhum texto vai para a saída. | RF-11 e o esclarecimento (a). O FLEURS dá a comparação com números publicados; os áudios reais dão a qualidade que importa | Common Voice (exige conta e aceite de termos); só o FLEURS (fala lida, otimista para áudio de grupo) | 🟢 |
| D-20 | **Observabilidade:**<br>• métricas `media_stored_total{kind}`, `media_unavailable_total{kind,reason}`, `media_processed_total{kind,outcome}`, `media_queue_size{kind}`, `transcription_rtf` (histograma), `transcription_latency_seconds` (da chegada ao fim) e `transcriber_up`;<br>• painel "Mídia" no Grafana;<br>• alertas `TranscriptionQueueStalled` (fila sem cair por 30 min com o worker no ar) e `TranscriberDown` (5 min);<br>• trace do job com o motor e o modelo como atributos. | RF-13; padrão da S2 e da S3 | Só logs (sem alerta de fila parada) | 🟢 |
| D-21 | **Regras de arquitetura novas:**<br>• `transcriber-engine-isolated`: chamadas ao motor só em `src/modules/media/infrastructure/transcribers/**`;<br>• `object-store-isolated`: `@aws-sdk/*` só em `object-store/**`;<br>• `media` não importa `channels/**`. | RF-07 (teste de arquitetura impede acoplamento ao motor); ADR-0005 | Só convenção (não barra o acoplamento) | 🟢 |

## 4. Premissas

Nenhuma `[DÚVIDA]` ficou aberta no `requirements.md`. Premissas técnicas verificáveis:

| Premissa | Origem (`requirements.md` seção) | Risco se errada |
|----------|----------------------------------|-----------------|
| O Speaches 0.8.3 devolve segmentos com tempo e aceita Ogg/Opus | RF-07; D-07 e D-10 | O adaptador do whisper.cpp entra no lugar, com a mesma porta (uma ação a mais) |
| O arquivo de áudio do export é byte a byte igual ao baixado pela captura | RN-04; D-16 | A reconciliação de áudio não casa e o mesmo áudio fica duplicado. Medir na demonstração; alternativa: duração ±1 s junto com o horário |
| Algum modelo atinge WER ≤ 20% e fator de tempo real ≤ 0,5 nesta CPU | RNF de qualidade e de desempenho | Nenhum candidato passa nos dois: o usuário escolhe entre precisão e velocidade com os números na mão (decisão registrada na ADR nova) |

## 5. Delta arquitetural

| Componente | Arquivo de origem no legado | Tipo de mudança | Resumo |
|------------|------------------------------|-----------------|--------|
| media (novo) | `_reversa_sdd/sdd/media-transcription.md` | componente-novo | Preparar e guardar anexos, processar por tipo, porta `Transcriber`, adaptadores `openai-compatible` e `fake`, armazenamento cifrado |
| ingestion | `_reversa_sdd/sdd/ingestion.md#6` | regra-alterada | Grava `attachments` e publica `media.process` no outbox; reconciliação de áudio por hash |
| knowledge | `_reversa_sdd/sdd/knowledge-indexing.md#6` | regra-alterada | Trechos da transcrição ativa com faixa de tempo; reindexação substitui trechos |
| retrieval | `_reversa_sdd/sdd/retrieval.md#6` | regra-alterada | `Evidence` com tipo, faixa e duração |
| agent | `_reversa_sdd/sdd/conversational-agent.md#6` | regra-alterada | Citação no formato de áudio |
| channel contract | `_reversa_sdd/sdd/channel-contract.md#6` | contrato-alterado | 1.3.0: `fetchMedia`, anexo com `sha256` e `durationSeconds`, `Citation` com faixa de áudio |
| whatsapp adapter | `_reversa_sdd/sdd/whatsapp-baileys-adapter.md#6` | regra-alterada | Áudio de grupo autorizado reportado e baixável; `supportsMedia: true` |
| whatsapp-export importer | `_reversa_sdd/sdd/whatsapp-export-importer.md#6` | regra-alterada | Áudios vinculados ao ZIP; relatório com áudios vinculados, ausentes e na fila |
| platform (infra, config, worker) | `_reversa_sdd/sdd/platform-foundation.md#6` | componente-novo | Container do motor, `PALANTIR_MEDIA_KEY`, configuração da transcrição, worker assina `media.process`, painel e alertas |
| eval | `scripts/eval.ts` (S0) | componente-novo | `eval:transcricao` (preparar, fleurs, medir) |

## 6. Delta no modelo de dados

- Resumo das mudanças: tabelas `attachments`, `transcripts` e `transcript_segments`; `message_chunks` ganha `audio_start_s` e `audio_end_s`; índice para a reconciliação de áudio por (`source_id`, `sha256`). Sem mudança em `messages`, que já aceita `kind = audio` e `text` nulo.
- Detalhe completo em: `_reversa_forward/005-perguntar-sobre-audios/data-delta.md`

## 7. Delta de contratos externos

| Contrato | Tipo | Arquivo de detalhe |
|----------|------|--------------------|
| Porta `Transcriber` e API HTTP do motor | HTTP (interno, loopback) | `interfaces/transcriber.md` |
| Job `media.process` | fila (pg-boss) | `interfaces/job-media-process.md` |
| Contrato do canal 1.3.0 (`fetchMedia`, anexo, citação) | TypeScript + JSON Schema | `interfaces/contrato-canal-midia.md` |
| `npm run import` (relatório) e `npm run eval:transcricao` | CLI | `interfaces/cli-importacao-e-medicao.md` |

## 8. Plano de migração

1. `npm run setup`: gera e preserva `PALANTIR_MEDIA_KEY`, sobe o container `transcriber` e mantém as chaves existentes.
2. `npm run db:migrate`: aplica a `0007_media.sql`. Só cria tabelas e colunas nulas; reversível.
3. Download dos modelos candidatos e medição (`eval:transcricao`). O modelo escolhido vai para `PALANTIR_TRANSCRIBER_MODEL` no `.env`, que o setup passa a preservar.
4. Reimportar as conversas com áudios (T3): entram só as mensagens de áudio (chaves novas), e o resto cai como "Já existentes".
5. Rollback: `PALANTIR_TRANSCRIPTION=off` para a transcrição (áudios guardados, `pending`). `PALANTIR_MEDIA_STORE_KINDS=` (vazio) volta ao comportamento da S3 para mídias novas.

## 9. Riscos e mitigações

| ID | Risco | Impacto | Probabilidade | Mitigação |
|----|-------|---------|---------------|-----------|
| R-01 | Nenhum modelo cabe em WER ≤ 20% com fator de tempo real ≤ 0,5 nesta CPU (Core Ultra 7 165U, sem GPU) | médio | média | A medição decide com números; concorrência 1 e prioridade do ao vivo; a escolha fica registrada numa ADR nova. Um motor remoto continua sendo só configuração (com liberação) |
| R-02 | O áudio do export difere do baixado ao vivo (hash diferente) | médio | baixa | Teste na demonstração com o mesmo áudio pelos dois caminhos; reserva por duração e horário (premissa 2) |
| R-03 | O Speaches 0.8.3 não confirma algum dos pontos da D-10 | baixo | média | Spike na primeira ação; adaptador do whisper.cpp como reserva, com a mesma porta |
| R-04 | Backlog do T3 (~158 áudios, possivelmente horas de fala) ocupa a CPU por muito tempo | baixo | alta | Concorrência configurável, prioridade do ao vivo e `PALANTIR_TRANSCRIPTION=off` para pausar. O painel mostra a fila e o tempo estimado |
| R-05 | Download de mídia pelo número do agente aumenta o risco de bloqueio | médio | baixa | Download só de grupo autorizado e posterior à autorização; sem reenvio nem reupload; o risco do modo `agent` já foi aceito na S3 (ADR-0009) |
| R-06 | Áudio de terceiros guardado sem base legal definida | médio | — | Só grupos de teste com consentimento e conversas importadas pelo próprio usuário; cifra em repouso; exclusão vem com a S5 (lacuna conhecida) |
| R-07 | A fatia passa das ~15 ações da regra | médio | alta | O `/reversa-to-do` mira até 18. Se passar, a opção é dividir: S4a (importação, armazenamento, motor, medição, resposta) e S4b (áudio ao vivo e reconciliação) |
| R-08 | Imagem de 3 GB do motor e ~4 GB de modelos no disco | baixo | alta | Documentar no onboarding; `PRELOAD` só do modelo escolhido depois da medição |

## 10. Critério de pronto

- RF-01 a RF-15 cobertos por testes, com os 9 cenários do `requirements.md` mapeados para testes unitários, de integração, de contrato e E2E. O motor falso é usado em todos os testes automáticos, e o real só no spike e na demonstração.
- Os 7 jobs da esteira verdes e a DoR local (`npm run dor`), com mutação ≥ 60% nos módulos tocados.
- A medição rodada e o modelo padrão escolhido com números, registrado numa ADR nova (`0010-transcricao-local`).
- Demonstração manual seguindo o `onboarding.md` deste diretório:
  - T3 reimportado com os áudios;
  - pergunta sobre algo dito num áudio respondida com o ponto do trecho;
  - áudio mandado no grupo autorizado respondido em minutos;
  - reimportação do grupo com o áudio reconciliado.

## 11. Histórico de alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-11-23 | Versão inicial gerada por `/reversa-plan` | reversa |
