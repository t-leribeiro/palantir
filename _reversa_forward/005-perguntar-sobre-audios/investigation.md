# Investigation: Perguntar sobre o que foi dito em áudios (fatia S4)

> Identificador: `005-perguntar-sobre-audios`
> Data: `2026-11-23`

## 1. Ambiente medido (sem ler conteúdo)

| Item | Valor | Como foi medido |
|------|-------|-----------------|
| CPU | Intel Core Ultra 7 165U, 14 threads lógicas | `Win32_Processor` |
| Memória | 31 GB | `Win32_ComputerSystem` |
| GPU | Só a integrada (Intel Graphics); sem `nvidia-smi` | `Win32_VideoController` |
| ffmpeg na máquina | Ausente | `which ffmpeg` |
| Docker | Presente (Docker Desktop) | `which docker` |
| Áudios nos exports reais | T3: 158 `.opus`, 31 MB. Contas da Casa e Casa Sinop: nenhum | Listagem do ZIP por extensão (só contagens e tamanhos) |
| Outras mídias | T3: 143 jpg, 24 webp, 3 png, 4 vídeos, 2 pdf, 2 vcf, 1 xlsx. Contas da Casa: 227 jpg, 2 pdf | Idem |

Consequência: a transcrição roda em CPU. O motor precisa vir empacotado (container), porque não há ffmpeg nem toolchain de build na máquina.

## 2. Motores de transcrição avaliados

| Opção | Como roda | Prós | Contras | Veredito |
|-------|-----------|------|---------|----------|
| **Speaches** (sucessor do `faster-whisper-server`), `ghcr.io/speaches-ai/speaches:0.8.3-cpu` | Container; faster-whisper e CTranslate2 int8 | API compatível com OpenAI (`POST /v1/audio/transcriptions`): o mesmo adaptador serve a um SaaS. Carrega e descarrega modelos sob demanda. Imagem CPU oficial | Imagem grande (3,04 GB, medido no pull). Formato `verbose_json`, aceite de Opus e download de modelos não confirmados na documentação lida | **Escolhido**, com verificação na primeira ação (D-10) |
| whisper.cpp server, `ghcr.io/ggml-org/whisper.cpp:main` | Container; modelos ggml | Leve; a imagem traz ffmpeg; rápido em CPU | API própria (`/inference`), modelos baixados à mão; a tag `main` é móvel (precisaria de digest) | Reserva |
| `hwdsl2/whisper-server` | Container, API compatível com OpenAI | Passo de pré-download documentado; int8 recomendado em CPU | Projeto de uma pessoa, menos adotado | Descartado |
| transformers.js (ONNX) no Node | Dentro do worker | Sem container | Mais lento em CPU; pesa a memória do worker; modelos grandes pouco práticos | Descartado |
| `nodejs-whisper` (binding do whisper.cpp) | Compila na instalação | Sem container | Exige toolchain C++ no Windows | Descartado |
| API paga (OpenAI, Groq e outros) | Rede | Rápido e preciso | Custo e áudio fora da máquina; fora da v0.1 | Futuro, pelo mesmo adaptador e só com `ALLOW_REMOTE` (D-09) |

Pontos do Speaches confirmados na documentação (speaches.ai, lida em 2026-11-23 por um agente de busca):
- endpoint `POST /v1/audio/transcriptions` com `file` e `model` em multipart;
- porta 8000 no container;
- cache de modelos em `/home/ubuntu/.cache/huggingface/hub`;
- carga e descarga automáticas, com `stt_model_ttl` de 300 s por padrão;
- `preload_models` baixa modelos na partida e encerra o container se algum falhar;
- `speaches-cli model download <id>` como download explícito;
- tags `latest-cpu` e `0.8.3-cpu` no registro (`docker manifest inspect`).

Não confirmados, e por isso verificados no spike (D-10):
- campos do `verbose_json`;
- aceite direto de Ogg/Opus;
- `POST /v1/models/{id}`;
- ids `medium` e `large-v3-turbo` no registro.

A sondagem local do container foi bloqueada pelo controle de permissões desta sessão e fica para o coding.

## 3. Conjunto público para o WER

FLEURS pt-BR (`google/fleurs` no Hugging Face):
- licença CC BY 4.0;
- download anônimo verificado com `curl` (HTTP 200 sem token);
- arquivos de transcrição: `data/pt_br/test.tsv` (563 KB), `dev.tsv` e `train.tsv`;
- áudio: `data/pt_br/audio/test.tar.gz` (621 MB) e `dev.tar.gz` (247 MB).

É fala lida, e por isso dá um WER mais otimista que o de áudio de grupo: serve para comparar com números publicados, não para decidir sozinho.

Comparabilidade: os números publicados usam normalizadores diferentes (números por extenso ou em dígitos, pontuação). Só vale comparar números calculados com a mesma normalização. Por isso o comando aplica uma normalização própria e igual para todos: NFC, minúsculas, sem pontuação e espaços colapsados.

Descartado: Common Voice pt, que exige conta e aceite de termos.

## 4. Padrões aplicados

- **Outbox:** o anexo e o job `media.process` são gravados na mesma transação da mensagem. O mesmo vale para a transcrição e o job `knowledge.index` (`ingestion.md` RF-07, já usado desde a S0).
- **Endereçamento pelo conteúdo:** a chave do objeto é o SHA-256, o que torna o upload idempotente e dispensa um passo de deduplicação.
- **Porta e adaptador:** `Transcriber`, com o adaptador escolhido por configuração, igual ao `WhatsAppProvider` da S2.
- **Cifra por envelope simples:** AES-256-GCM com chave do `.env`, igual à sessão do WhatsApp (S2).
- **Fila com prioridade:** a opção `priority` do pg-boss coloca o áudio ao vivo na frente do backlog da importação.

## 5. Duração do Ogg/Opus

Um arquivo Ogg é uma sequência de páginas `OggS`. A posição de granulo (bytes 6 a 13, little-endian) da última página, menos o `pre-skip` do cabeçalho `OpusHead` (bytes 10 e 11), dividida por 48.000, dá a duração em segundos. São cerca de 40 linhas de TypeScript puro, testáveis com arquivos sintéticos. Formatos sem esse atalho ficam com a duração que o motor devolve.

## 6. Fontes

- [Speaches: documentação](https://speaches.ai/), [instalação](https://speaches.ai/installation/), [speech-to-text](https://speaches.ai/usage/speech-to-text/), [configuração](https://speaches.ai/configuration/), [releases](https://github.com/speaches-ai/speaches/releases)
- [faster-whisper-server (arquivado, aponta para o Speaches)](https://hub.docker.com/r/fedirz/faster-whisper-server)
- [whisper.cpp: imagens de container](https://github.com/ggml-org/whisper.cpp/pkgs/container/whisper.cpp) e [repositório](https://github.com/ggml-org/whisper.cpp)
- [hwdsl2/whisper-server](https://hub.docker.com/r/hwdsl2/whisper-server)
- [FLEURS no Hugging Face](https://huggingface.co/datasets/google/fleurs)
- [Discussão sobre normalização e WER no FLEURS](https://huggingface.co/juancopi81/whisper-medium-es-train-valid/discussions/1)
