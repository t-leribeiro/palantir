# ADR-0010: Transcrição local e substituível, com mídia cifrada endereçada pelo conteúdo

- Status: aceito (o modelo padrão é confirmado pela medição, seção "Medição")
- Data: 2026-11-23
- Decisores: Leandro (produto), reversa-plan
- Origem: `_reversa_forward/005-perguntar-sobre-audios/roadmap.md` (D-02 a D-13, D-19, D-21) e esclarecimento de 2026-11-23

## Contexto

A fatia S4 responde a "em qual áudio alguém falou de X?" para áudios importados e capturados ao vivo. Ela precisa de três coisas:
- guardar o áudio original de terceiros com segurança;
- transcrevê-lo em português com tempo por trecho;
- escolher um motor sem custo e sem mandar o áudio para fora da máquina.

A máquina de desenvolvimento tem só CPU (Intel Core Ultra 7 165U, 31 GB de RAM, sem GPU dedicada) e não tem ffmpeg. O usuário pediu que o modelo do Whisper possa ser trocado, e também o motor, inclusive por um serviço de transcrição SaaS no futuro.

## Decisão

1. **Porta `Transcriber`** no módulo `media`, com a implementação escolhida por `PALANTIR_TRANSCRIBER`:
   - `openai-compatible` (padrão) fala `POST /v1/audio/transcriptions` com `verbose_json` e segmentos;
   - `fake` serve aos testes.

   Trocar o modelo é configuração (`PALANTIR_TRANSCRIBER_MODEL`). Trocar de motor é um adaptador novo em `src/modules/media/infrastructure/transcribers/`; a regra `transcriber-engine-isolated` impede o resto do código de depender do motor.
2. **Motor padrão:** Whisper em CPU (faster-whisper, int8), servido pelo Speaches `ghcr.io/speaches-ai/speaches:0.8.3-cpu`, num container que o `npm run setup` sobe (módulo Terraform `transcriber`, `127.0.0.1:8090`, 4 GB de memória). O spike da T001 confirmou com fala sintética:
   - segmentos com início e fim;
   - idioma e duração;
   - aceite direto de Ogg/Opus;
   - `POST /v1/models/{id}` para baixar modelos;
   - erros 415 (áudio inválido) e 404 (modelo ausente).
3. **Motor remoto (SaaS) só por escolha explícita:** uma URL fora de loopback é recusada na configuração sem `PALANTIR_TRANSCRIBER_ALLOW_REMOTE=true`. Ligar o remoto registra um aviso na partida. O mesmo adaptador serve a qualquer API compatível com a da OpenAI.
4. **Mídia cifrada na aplicação:** AES-256-GCM com `PALANTIR_MEDIA_KEY`, gerada e preservada pelo setup, gravada no SeaweedFS (S3, bucket privado). O SDK `@aws-sdk/client-s3` fica isolado pela regra `object-store-isolated`.
5. **Chave do objeto pelo conteúdo:** `<space>/<source>/<sha256>`. O mesmo áudio por captura e importação vira 1 objeto, e o upload é idempotente.
6. **Caminho de anexo comum a todos os tipos:**
   - preparar (baixar, guardar e medir);
   - registrar na ingestão (outbox `media.process`);
   - processar pelo processador do tipo;
   - indexar.

   Só áudio é guardado (`PALANTIR_MEDIA_STORE_KINDS=audio`) e processado. Imagem e documento depois são configuração e um processador novo.
7. **Transcrição versionada:** uma ativa por anexo, a anterior guardada. A mensagem original nunca muda.

## Medição

O comando `npm run eval:transcricao` mede os candidatos em dois conjuntos:
- 15 a 20 áudios reais do T3, transcritos à mão pelo usuário, só em `exports/medicao/`;
- 50 frases do FLEURS pt-BR (CC BY 4.0).

Os candidatos são `Systran/faster-whisper-small`, `Systran/faster-whisper-medium` e `deepdml/faster-whisper-large-v3-turbo-ct2`, em CPU. O padrão é o mais preciso com WER ≤ 20% e fator de tempo real ≤ 0,5.

| Modelo | Conjunto | Áudios | WER | Tempo real | Memória |
|--------|----------|--------|-----|------------|---------|
| (a preencher com a tabela do `medir` na demonstração) | | | | | |

Até a medição, o padrão é o `small`. No spike, ele transcreveu 16 s de fala sintética em 4,5 s (tempo real ≈ 0,28), o que serve só como sinal.

## Consequências

- Positivas:
  - R$ 0 por minuto e nada sai da máquina;
  - trocar de modelo, motor ou fornecedor não toca o núcleo;
  - a medição é repetível com outro motor, pela mesma porta;
  - o áudio fica guardado para transcrever de novo.
- Negativas e riscos:
  - imagem de ~3 GB e ~4 GB de modelos no disco;
  - a CPU limita o tamanho do modelo: talvez nenhum candidato cumpra as duas metas, e aí a escolha é pelo equilíbrio, registrada aqui;
  - o backlog de uma importação grande ocupa a CPU (a concorrência é configurável e o ao vivo tem prioridade);
  - perder `PALANTIR_MEDIA_KEY` torna os áudios guardados ilegíveis;
  - o ponto citado é o início de um bloco de até ~400 caracteres da transcrição, não a palavra exata.

## Alternativas consideradas

- **whisper.cpp server** (`ghcr.io/ggml-org/whisper.cpp`): leve, mas tem API própria e modelos baixados à mão. Ficou como reserva, e o spike mostrou que não foi preciso.
- **transformers.js no Node:** mais lento em CPU e pesa o worker.
- **API paga como padrão:** custo e áudio fora da máquina. Fica possível, só por escolha explícita.
- **SSE do SeaweedFS:** suporte e gestão da chave menos claros que a cifra na aplicação, já usada na sessão do WhatsApp.
- **Guardar todos os tipos de mídia já:** dados de terceiros sem uso nesta fatia; recusado no esclarecimento.

## Quando revisar

- Depois da medição: preencher a tabela e fixar `PALANTIR_TRANSCRIBER_MODEL` no `.env.example`.
- Quando houver GPU disponível, ou um modelo menor com WER melhor: medir de novo pelo mesmo comando.
- Antes de ligar um motor remoto: registrar aqui o fornecedor, o custo e a base legal para mandar áudio de terceiros.
- Quando imagem ou documento passar a ser processado: um processador novo e uma atualização nesta ADR.
