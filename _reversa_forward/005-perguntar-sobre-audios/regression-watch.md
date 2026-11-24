# Regression watch: Perguntar sobre o que foi dito em áudios (fatia S4)

> Identificador: `005-perguntar-sobre-audios`
> Feature greenfield: nenhuma regra 🟢 extraída de código para vigiar ainda.

## Watch principal

| ID | Origem (arquivo, seção) | Regra esperada após mudança | Tipo de verificação | Sinal de violação |
|----|-------------------------|-----------------------------|---------------------|-------------------|

(vazio até uma extração `/reversa` confirmar as regras abaixo como 🟢)

## Observações

| ID | Origem | Regra implementada | Verificada por |
|----|--------|--------------------|----------------|
| W001 | `requirements.md#RN-01` | Só áudio de fonte autorizada, posterior à autorização, é baixado; a preparação confere a autorização antes de baixar | `test/unit/media/prepare-attachments.test.ts`, `test/unit/whatsapp/whatsapp-capture.test.ts`, `test/e2e/media-audio.test.ts` |
| W002 | `requirements.md#RN-02`, `RF-04` (D-04, D-05) | Arquivo guardado cifrado (AES-256-GCM) no bucket privado, com chave pelo conteúdo; o mesmo conteúdo gera 1 objeto | `test/unit/media/envelope.test.ts`, `test/integration/object-store.test.ts`, `test/integration/media-pipeline.test.ts` |
| W003 | `requirements.md#RN-03`, `RF-07` (D-08, D-09, D-21) | Motor atrás da porta `Transcriber`, escolhido por configuração; motor fora de loopback só com `ALLOW_REMOTE`; nada fora de `transcribers/` usa o motor | `test/unit/media/transcribers.test.ts`, `test/unit/platform/media-config.test.ts`, `test/architecture/rules.test.ts` |
| W004 | `requirements.md#RN-03` (D-13) | Uma transcrição ativa por anexo; a anterior fica guardada; a mensagem original não muda | `test/integration/media-schema.test.ts`, `test/unit/media/process-attachment.test.ts` |
| W005 | `requirements.md#RN-04`, `RF-05` (D-16) | O mesmo áudio por captura e importação (mesma fonte, até 60 s, mesmo SHA-256) fica com 1 mensagem e 1 objeto, nos dois sentidos | `test/integration/media-pipeline.test.ts`, `test/unit/ingestion/ingest-message.test.ts`, `test/e2e/media-audio.test.ts` |
| W006 | `requirements.md#RN-05`, `RF-09` (D-15) | A citação de áudio mostra a duração e o ponto do bloco; a `Citation` leva o tipo e a faixa | `test/unit/agent/compose-answer.test.ts`, `test/e2e/media-audio.test.ts` |
| W007 | `requirements.md#RN-06`, `RF-10` | Acima de 60 min fica `too_long`; arquivo ilegível fica `failed/corrupted` sem nova tentativa; sem fala fica `empty` e não é indexado; falha do motor tenta 3 vezes | `test/unit/media/process-attachment.test.ts`, `test/integration/media-pipeline.test.ts` |
| W008 | `requirements.md#RN-07` (D-12) | O áudio ao vivo (prioridade 10) é processado antes do backlog da importação (prioridade 0) | `test/integration/media-pipeline.test.ts` |
| W009 | `requirements.md#RN-08`, `RF-01`, `RF-02` (D-17) | Export com mídias: áudio vira mensagem com o arquivo, ou `missing_in_export`; reimportar não duplica; `<Mídia oculta>` segue como outras mídias | `test/unit/whatsapp-export/import-audio.test.ts`, `test/unit/whatsapp-export/real-exports.test.ts` (158 áudios do T3, só contagens) |
| W010 | `requirements.md#RN-09` | Áudio mandado direto ao agente continua recebendo o aviso de "só texto" | `test/unit/whatsapp/whatsapp-channel.test.ts`, `test/e2e/whatsapp-agent.test.ts` |
| W011 | `requirements.md#RN-10`, `RF-15` (D-02) | Caminho de anexo comum a todos os tipos: guardar é configuração e processar é registrar um processador; hoje só áudio | `test/unit/media/prepare-attachments.test.ts`, `test/unit/ingestion/ingest-message.test.ts`, `test/unit/media/process-attachment.test.ts` |
| W012 | `requirements.md#RF-11` (D-19) | A medição é determinística pela semente, lê só pares preenchidos e mostra só números | `test/unit/scripts/transcricao.test.ts`, `test/unit/media/media-domain.test.ts` |
| W013 | `requirements.md#RF-12` | Canal de teste e WhatsApp simulado passam os testes de mídia da suíte de contrato (1.3.0) | `test/contract/fake-channel.contract.test.ts`, `test/contract/whatsapp-capture.contract.test.ts` |
| W014 | `requirements.md#RF-13` (D-20) | Métricas de mídia sem texto, painel "Mídia" e alertas de fila parada e de motor fora do ar | `test/unit/media/otel-observer.test.ts`, `promtool check rules` |
| W015 | `requirements.md#RF-14` | Transcrição desligada mantém os áudios guardados e pendentes; ao religar, a varredura republica e a fila retoma | `test/e2e/media-audio.test.ts`, `test/integration/media-pipeline.test.ts` |
| W016 | `requirements.md#6` (privacidade) | Logs sem texto transcrito, sem nome de arquivo de mídia e sem telefone; nome fixo no envio ao motor | `test/e2e/media-audio.test.ts`, `test/unit/media/transcribers.test.ts` |

## Histórico de re-extrações

(vazio)

## Arquivadas

(vazio)
