# Adendo: Perguntar sobre o que foi dito em áudios (fatia S4)

> Feature: `005-perguntar-sobre-audios`
> Data: `2026-11-24`
> Cenário: `greenfield`

## Vigência

Vigente desde 2026-11-24.

## Resumo da entrega

O usuário pergunta ao agente, pelo WhatsApp, "em qual áudio alguém falou de X?". A resposta aponta o áudio certo: quem mandou, em qual conversa, quando, a duração e o ponto do trecho, com o texto transcrito. Isso vale para os áudios que vêm na importação de um export com mídias e para os áudios mandados num grupo autorizado.

O áudio é guardado cifrado no armazenamento local (SeaweedFS) e transcrito na própria máquina. O padrão é o Whisper `large-v3-turbo` em CPU, servido pelo Speaches, atrás da porta `Transcriber`. Trocar de modelo, de motor ou de fornecedor é configuração. Um motor remoto só entra por escolha explícita (`PALANTIR_TRANSCRIBER_ALLOW_REMOTE=true`).

Só o áudio é guardado nesta fatia. O caminho de anexo, porém, é comum a todos os tipos: guardar outro tipo é configuração, e processá-lo é registrar um processador. A resposta continua só em texto. Mostrar ou mandar o áudio original fica para a S7.

As 21 ações foram concluídas, mais a emenda E001: o `progress.jsonl` tem 24 linhas, incluindo as correções da T001 e da T007. A entrega está nos PRs #11 e #12. A demonstração com o chip foi feita em 2026-11-24:
- um áudio mandado ao vivo no grupo autorizado e um áudio do T3 importado foram respondidos com citação;
- a transcrição dos outros 157 áudios do T3 seguia em segundo plano.

A demonstração expôs três problemas, todos corrigidos:
- a medição acumulava modelos na memória do motor e distorcia tempo e memória;
- as referências dos áudios reais eram rascunhos do turbo, e a ferramenta passou a avisar quando isso acontece;
- "em qual áudio..." usava a palavra "áudio" como termo de busca. A emenda E001 corrigiu isso: a pergunta passa a buscar só entre áudios.

## Impacto por artefato da extração

As specs continuam 🟡 PLANEJADO. Leia-as junto com este adendo, com os adendos `001` a `004` e com os de bug (`bug-*`).

| Artefato | Seção | Tipo de impacto | Delta |
|----------|-------|-----------------|-------|
| `_reversa_sdd/sdd/media-transcription.md` | 6. Requisitos Funcionais | componente-novo | O módulo `media` foi implementado:<br>• preparação no núcleo: confere a autorização da fonte antes de baixar, tenta de novo em 1, 2 e 4 s, aceita até 64 MB, mede a duração do Ogg e calcula o SHA-256;<br>• RF-01: a chave do objeto passou a ser `space/source/sha256`, pelo conteúdo;<br>• RF-03: um só job `media.process`, genérico por tipo, no lugar de `media.store` e `media.transcribe`;<br>• transcrição versionada (uma ativa por anexo), com status `done`, `empty`, `too_long` (acima de 60 min) ou `failed`.<br>Não entregues nesta fatia: a retranscrição por fonte ou período (RF-07) e a URL temporária para ouvir (RF-09, fica para a S7). |
| `_reversa_sdd/sdd/media-transcription.md` | 9. Modelo de Dados | delta-de-dados | Migração `0007_media.sql`:<br>• `attachments`, um por mensagem, com `sha256`, `duration_s`, `storage_status` (`stored` ou `unavailable` com motivo) e `processing_status`;<br>• `transcripts`, com uma única transcrição ativa por anexo e motor, modelo, idioma e fator de tempo real;<br>• `transcript_segments`. |
| `_reversa_sdd/sdd/media-transcription.md` | 10. Integrações e Dependências | componente-novo | Motor: Speaches `0.8.3-cpu` (faster-whisper int8), em `127.0.0.1:8090`, com 4 GB. O modelo padrão é `deepdml/faster-whisper-large-v3-turbo-ct2`, escolhido na medição (ADR-0010). Arquivos cifrados com AES-256-GCM e `PALANTIR_MEDIA_KEY`. `@aws-sdk/*` só pode ser usado em `object-store/`, e o motor só em `transcribers/` (regras de arquitetura). |
| `_reversa_sdd/sdd/channel-contract.md` | 6. Requisitos Funcionais | delta-de-contrato-externo | Contrato 1.3.0, aditivo:<br>• `fetchMedia` e `MediaUnavailableError`;<br>• o anexo ganha `sha256`, `durationSeconds`, `status` e `unavailableReason`;<br>• `kind=audio` exige anexo;<br>• `Citation` ganha `kind`, `audioStartS` e `audioEndS`.<br>A suíte de contrato roda os testes de mídia no canal de teste e no WhatsApp simulado. |
| `_reversa_sdd/sdd/ingestion.md` | 6. Requisitos Funcionais | regra-alterada | A mensagem de áudio grava o anexo e, se o arquivo está guardado e o tipo tem processador, publica `media.process` no outbox, com prioridade 10 ao vivo e 0 na importação. O áudio ao vivo e o importado se reconciliam pelo mesmo SHA-256, na mesma fonte e em até 60 s, nos dois sentidos. |
| `_reversa_sdd/sdd/knowledge-indexing.md` | 6. Requisitos Funcionais | regra-alterada | A transcrição ativa é indexada em blocos de até ~400 caracteres, cada um com a faixa do áudio de onde saiu. Reindexar substitui os blocos. Transcrição vazia não é indexada. |
| `_reversa_sdd/sdd/knowledge-indexing.md` | 9. Modelo de Dados | delta-de-dados | `message_chunks` ganha `audio_start_s` e `audio_end_s`, com CHECK de faixa válida. |
| `_reversa_sdd/sdd/retrieval.md` | 6. Requisitos Funcionais | regra-alterada | A `Evidence` traz o tipo da mensagem, a faixa e a duração do áudio. A busca aceita um filtro por tipo (`kind: "audio"`) nas portas internas, sem mudar o contrato (emenda E001). |
| `_reversa_sdd/sdd/conversational-agent.md` | 6. Requisitos Funcionais | regra-alterada | A citação de áudio tem o formato "Ana em T3, 12/11/2026, áudio de 1:42, aos 0:37: “…”". O ponto citado é o início do bloco, não a palavra exata. Pergunta com "áudio" ou "áudios" busca só entre áudios e não usa a palavra como termo. Sem áudio sobre o assunto, a resposta é "Não encontrei áudio sobre isso." (E001). Áudio mandado direto ao agente continua recebendo o aviso de "só texto". |
| `_reversa_sdd/sdd/whatsapp-baileys-adapter.md` | 6. Requisitos Funcionais | regra-alterada | O provedor anuncia a mídia de grupo e só baixa quando o núcleo pede, depois de conferir a autorização. Para isso, guarda por pouco tempo as mensagens com mídia (até 500 mensagens, por até 15 min). Grupo não autorizado nunca tem mídia baixada. O log da biblioteca passou a mostrar o motivo técnico do erro, sem conteúdo e com os números mascarados. |
| `_reversa_sdd/sdd/whatsapp-export-importer.md` | 6. Requisitos Funcionais | regra-alterada | Num export com mídias, cada referência de áudio vira uma mensagem de áudio com o arquivo guardado. Se o arquivo falta no ZIP, a mensagem fica `unavailable` (`missing_in_export`). O relatório ganha as contagens de áudios vinculados, ausentes, com legenda e na fila. `<Mídia oculta>` continua contada como "outras mídias". Sem chave de mídia, a importação recusa antes de começar. |
| `_reversa_sdd/sdd/platform-foundation.md` | 6. Requisitos Funcionais | componente-novo | Peças novas:<br>• módulo Terraform `transcriber`;<br>• o setup gera e preserva `PALANTIR_MEDIA_KEY`;<br>• worker `media.process` com concorrência de 1 a 4, varredura de pendentes e sondagem do motor;<br>• `PALANTIR_TRANSCRIPTION=off` pausa sem perder áudio;<br>• painel "Mídia" e alertas `TranscriptionQueueStalled` e `TranscriberDown`;<br>• comandos `eval:transcricao` (preparar, fleurs, medir; um modelo por vez), `transcricao:modelos` e `media:conferir`. |
| `_reversa_sdd/prd.md` | 4. Escopo (in) | componente-novo | A transcrição local de áudios foi entregue para áudios importados e de grupos autorizados. O critério de aceite P1 (áudio) da seção 9 está atendido em texto. Ouvir o trecho original fica para a S7. |

Impactos registrados: 13 linhas, assim distribuídas:
- 6 `regra-alterada`
- 2 `delta-de-dados`
- 1 `delta-de-contrato-externo`
- 4 `componente-novo`

Regras 🟡 que evoluem:
- A RN-07 da S3 ("mídia de grupo autorizado é contada e descartada") vale agora só para os tipos fora de `PALANTIR_MEDIA_STORE_KINDS`.
- As RF-01 e RF-03 de `media-transcription` mudaram como descrito na tabela.

## Regras sob vigilância

W001 a W016, em `_reversa_forward/005-perguntar-sobre-audios/regression-watch.md` (seção Observações). A emenda E001 não criou watch item.

## Fontes

- `_reversa_forward/005-perguntar-sobre-audios/legacy-impact.md`
- `_reversa_forward/005-perguntar-sobre-audios/regression-watch.md`
- `_reversa_forward/005-perguntar-sobre-audios/requirements.md` (inclui a seção Emendas)
- `_reversa_forward/005-perguntar-sobre-audios/roadmap.md` (D-01 a D-21)
- `_reversa_forward/005-perguntar-sobre-audios/progress.jsonl`
- `_reversa_forward/005-perguntar-sobre-audios/actions.md` (Notas de execução e Emendas)
- `_reversa_forward/005-perguntar-sobre-audios/interfaces/`
- `docs/adr/0010-transcricao-local-substituivel.md`, `docs/adr/0004-contrato-do-canal-schema-first.md`
