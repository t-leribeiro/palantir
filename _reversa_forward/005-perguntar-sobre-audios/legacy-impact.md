# Legacy impact: Perguntar sobre o que foi dito em áudios (fatia S4)

> Identificador: `005-perguntar-sobre-audios`
> Data: `2026-11-23`
> Feature greenfield sobre as features 001 a 004, sem legado extraído de código. Âncora: `prd.md`, specs SDD e os adendos `addenda/001-*` a `addenda/004-*` e `addenda/bug-*`.
> Política de edição no momento da execução: `allowLegacyEdits: true`, `allowedPaths: []` (projeto inteiro liberado).
> Execução: 21 de 21 ações.

## Arquivos afetados

| Arquivo afetado | Componente (spec) | Tipo | Severidade | Justificativa |
|-----------------|-------------------|------|------------|---------------|
| `src/modules/media/**` (novo) | media-transcription | componente-novo | HIGH | Caminho comum de anexo: preparar, guardar cifrado, processar por tipo e indexar. Inclui a porta `Transcriber` com os adaptadores `openai-compatible` e `fake`, a duração do Ogg, o WER e as métricas |
| `migrations/0007_media.sql` | media-transcription, knowledge-indexing | delta-de-dados | MEDIUM | `attachments`, `transcripts` (uma ativa por anexo), `transcript_segments` e a faixa de áudio em `message_chunks` |
| `contracts/channel/*.schema.json`, `src/contracts/channel/*` | channel-contract | delta-de-contrato-externo | MEDIUM | Contrato 1.3.0, aditivo: `fetchMedia`, anexo preparado (`sha256`, `durationSeconds`, `status`, `unavailableReason`), `kind = audio` exige anexo e `Citation` com faixa de áudio |
| `src/modules/ingestion/**` | ingestion | regra-alterada | HIGH | Grava o anexo e publica `media.process` no outbox (prioridade 10 para o ao vivo); o áudio reconcilia pelo SHA-256 em até 60 s; anexo não preparado é recusado |
| `src/modules/knowledge/**` | knowledge-indexing | regra-alterada | MEDIUM | Blocos da transcrição ativa (até ~400 caracteres) com `audio_start_s` e `audio_end_s`; reindexar substitui os trechos |
| `src/modules/retrieval/**`, `src/modules/agent/domain/answer.ts`, `src/shared/duration.ts` | retrieval, conversational-agent | regra-alterada | MEDIUM | `Evidence` com tipo, faixa e duração; citação "áudio de m:ss, aos m:ss" |
| `src/channels/whatsapp/**` | whatsapp-baileys-adapter | regra-alterada | HIGH | O provedor anuncia a mídia de grupo e baixa sob demanda (mapa limitado a 500 mensagens e 15 min); áudio de grupo autorizado vira mensagem `audio`; `supportsMedia: true` |
| `src/channels/whatsapp-export/**` | whatsapp-export-importer | regra-alterada | MEDIUM | Áudios do ZIP viram mensagens com o arquivo guardado, ou indisponíveis; o relatório ganha as linhas de áudio |
| `src/channels/fake/fake-channel.ts` | channel-contract | regra-alterada | LOW | `fetchMedia` e áudio de teste para a suíte de contrato |
| `src/main/media.ts` (novo), `src/main/compose.ts`, `src/main/import.ts` | platform-foundation | componente-novo | MEDIUM | Composição da mídia: worker `media.process` com concorrência, varredura e sondagem do motor; captura com preparação; importação com armazenamento conferido antes |
| `src/platform/config.ts`, `src/platform/queue/job-queue.ts`, `src/platform/telemetry/instruments.ts`, `scripts/env-file.mjs`, `.env.example` | platform-foundation | regra-alterada | LOW | Configuração da mídia e do motor (guarda de motor remoto); chave de mídia gerada e preservada; prioridade, prazo e concorrência na fila; atributos de span |
| `infra/modules/transcriber/main.tf` (novo), `infra/local/main.tf` | platform-foundation | componente-novo | MEDIUM | Container Speaches `0.8.3-cpu` em `127.0.0.1:8090`, com 4 GB e volume de modelos |
| `infra/local/config/grafana/dashboards/media.json` (novo), `infra/local/config/prometheus/rules.yml` | platform-foundation | componente-novo | LOW | Painel "Mídia" e alertas `TranscriptionQueueStalled` e `TranscriberDown` |
| `scripts/eval-transcricao.ts`, `scripts/transcricao/**`, `scripts/transcricao-modelos.ts`, `scripts/media-conferir.ts`, `package.json` | platform-foundation | componente-novo | LOW | Medição (preparar, fleurs, medir), download de modelos e conferência da cifra |
| `.dependency-cruiser.cjs`, `test/architecture/**` | platform-foundation | regra-nova | LOW | Regras `object-store-isolated` e `transcriber-engine-isolated`, com fixtures |
| `test/**` (unit, integration, contract, e2e, support) | platform-foundation | componente-novo | LOW | TDD da fatia, com áudio Ogg sintético (`test/support/audio.ts`) e SeaweedFS em container (`test/support/object-storage.ts`) |
| `docs/adr/0010-*.md` (novo), `docs/adr/0004-*.md`, `docs/adr/README.md`, `README.md`, `CLAUDE.md`, `AGENTS.md`, `docs/plano-de-fatias.md` | platform-foundation | componente-novo | LOW | Decisão da transcrição e da mídia, contrato 1.3.0, comandos e status |

Arquivos pré-existentes modificados: os das features 001 a 004 listados acima. Nenhum arquivo anterior ao pipeline foi alterado.

## Diff conceitual por componente

- **media (novo):** o anexo é preparado pelo núcleo, nunca pelo canal. A preparação confere a autorização da fonte, baixa pela `fetchRef` com novas tentativas, mede a duração do Ogg, calcula o SHA-256 e grava cifrado em `<space>/<source>/<sha256>`. O processamento escolhe o processador pelo tipo. O de áudio chama a porta `Transcriber` e grava uma versão ativa com segmentos, e depois o `knowledge.index` sai no mesmo outbox. Áudio acima de 60 min fica `too_long`, arquivo ilegível fica `corrupted` sem nova tentativa, e sem fala fica `empty`.
- **ingestion:** antes, só texto entrava. Agora, a mensagem de áudio grava o anexo e, se ele está guardado e tem processador, publica `media.process` com prioridade. A reconciliação de áudio usa o mesmo arquivo (SHA-256) no lugar do texto.
- **knowledge e retrieval:** a busca encontra a palavra falada pelos blocos da transcrição e devolve de onde, no áudio, o bloco saiu.
- **agent:** a citação mostra a duração do áudio e o ponto do bloco. O texto das citações de texto não mudou.
- **whatsapp-baileys-adapter:** o adaptador continua só anunciando. A mensagem crua fica guardada por pouco tempo, e o download acontece quando o núcleo pede, depois da autorização. Grupos não autorizados nunca têm mídia baixada.
- **whatsapp-export-importer:** o export **com mídias** passa a trazer os áudios. `<Mídia oculta>` não diz o tipo e segue contada como "outras mídias".
- **platform-foundation:** novo container do motor, chave de mídia no setup, worker com a fila de mídia, painel e alertas.

## Preservadas

Feature greenfield: não há regras 🟢 extraídas de código para preservar. Os testes das features 001 a 004 continuam verdes. Com `PALANTIR_MEDIA_STORE_KINDS` vazio, a captura e a importação voltam ao comportamento da S3: mídia contada e descartada.

## Modificadas

Feature greenfield: nenhuma regra 🟢 alterada ou removida. Regras 🟡 que evoluem:
- **RN-07 da S3** ("mídia de grupo autorizado é contada e descartada"): vale agora só para os tipos fora de `PALANTIR_MEDIA_STORE_KINDS`. O áudio passa a ser guardado e transcrito.
- **Spec `media-transcription`, RF-01:** a chave do objeto deixou de ser `space/source/message/attachment` e passou a ser `space/source/sha256`, pelo conteúdo (D-04).
- **Spec `media-transcription`, RF-03:** os jobs `media.store` e `media.transcribe` viraram um só `media.process`, genérico por tipo, porque o armazenamento acontece na preparação, antes da ingestão (D-03, D-12).
