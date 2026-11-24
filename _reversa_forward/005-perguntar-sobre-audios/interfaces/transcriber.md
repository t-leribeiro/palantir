# Interface: porta `Transcriber` e motor HTTP

> Feature `005-perguntar-sobre-audios` · D-07, D-08, D-09 e D-10 do roadmap

## 1. Porta (TypeScript, `src/modules/media/application/ports.ts`)

```ts
export interface TranscribeInput {
  readonly audio: Uint8Array;          // binário em claro, ≤ 64 MB
  readonly mimeType: string;           // ex.: "audio/ogg; codecs=opus"
  readonly language?: string;          // padrão "pt"; omitido = detecção pelo motor
  readonly durationHint?: number;      // segundos, para o timeout
}

export interface TranscriptSegment { readonly start: number; readonly end: number; readonly text: string }

export interface TranscribeResult {
  readonly engine: string;             // ex.: "openai-compatible:speaches"
  readonly model: string;              // ex.: "Systran/faster-whisper-small"
  readonly modelVersion: string;       // "unknown" quando o motor não informa
  readonly language: string;
  readonly durationSeconds: number | null;
  readonly text: string;
  readonly segments: readonly TranscriptSegment[];
}

export type TranscriberErrorKind = "corrupted" | "engine_failed" | "timeout" | "unavailable";
export class TranscriberError extends Error { constructor(readonly kind: TranscriberErrorKind, message: string) }

export interface Transcriber {
  readonly engine: string;
  readonly model: string;
  transcribe(input: TranscribeInput): Promise<TranscribeResult>;
  health(): Promise<boolean>;
}
```

Regras:
- `corrupted` não tem nova tentativa. As demais são tentadas até 3 vezes pelo job (`job-media-process.md`).
- O resultado nunca vai para log. Só vão `engine`, `model`, a duração, o número de segmentos e o fator de tempo real.

## 2. Adaptadores

| `PALANTIR_TRANSCRIBER` | Arquivo | Uso |
|------------------------|---------|-----|
| `openai-compatible` (padrão) | `src/modules/media/infrastructure/transcribers/openai-compatible.ts` | Speaches local; no futuro, um SaaS com a mesma API |
| `fake` | `src/modules/media/infrastructure/transcribers/fake.ts` | Testes, E2E e CI: devolve segmentos determinísticos a partir de um roteiro embutido no áudio sintético |

Um motor com outra API (por exemplo, o whisper.cpp `/inference`) vira um novo arquivo nessa pasta e um novo valor de `PALANTIR_TRANSCRIBER`. A regra `transcriber-engine-isolated` impede chamadas ao motor fora dela.

## 3. Configuração

| Variável | Padrão | Regra |
|----------|--------|-------|
| `PALANTIR_TRANSCRIPTION` | `on` | `off` = o worker não assina `media.process` |
| `PALANTIR_TRANSCRIBER` | `openai-compatible` | `openai-compatible` ou `fake` |
| `PALANTIR_TRANSCRIBER_URL` | `http://127.0.0.1:8090` | Fora de loopback exige `ALLOW_REMOTE` |
| `PALANTIR_TRANSCRIBER_MODEL` | `deepdml/faster-whisper-large-v3-turbo-ct2` (escolhido na medição de 2026-11-24, ADR-0010) | Preservado pelo setup |
| `PALANTIR_TRANSCRIBER_ALLOW_REMOTE` | `false` | `true` registra aviso na partida: "transcrição remota ligada: o áudio sai desta máquina" |
| `PALANTIR_TRANSCRIBER_API_KEY` | vazio | Só para remoto; nunca logado |
| `PALANTIR_TRANSCRIBE_CONCURRENCY` | `1` | 1 a 4 |
| `PALANTIR_MEDIA_STORE_KINDS` | `audio` | Lista separada por vírgula, entre `audio`, `image`, `document` e `video` |
| `PALANTIR_MEDIA_KEY` | gerada pelo setup | 32 bytes em base64; trocar torna os objetos ilegíveis |

A configuração inválida é recusada na partida, com a mensagem da variável e sem o valor.

## 4. Requisição ao motor (`openai-compatible`)

```
POST {URL}/v1/audio/transcriptions
Content-Type: multipart/form-data
Authorization: Bearer {API_KEY}     (só se definida)

file=<binário; filename="audio.ogg">     (nome fixo, nunca o nome original)
model={MODEL}
language=pt
response_format=verbose_json
timestamp_granularities[]=segment
temperature=0
```

A resposta esperada é `verbose_json` (a confirmar no spike, D-10):

```json
{ "language": "portuguese", "duration": 102.4, "text": "…",
  "segments": [ { "id": 0, "start": 0.0, "end": 4.2, "text": "…" } ] }
```

Mapeamento:
- `language` com nome por extenso vira código ISO 639-1;
- `segments` vazio, ou `text` só com espaços, dá resultado vazio (`empty`);
- `segments` sem tempo é erro `engine_failed`.

| HTTP | Erro |
|------|------|
| 2xx | sucesso |
| 400 ou 415 com falha de decodificação | `corrupted` |
| 404 (modelo ausente) | `engine_failed`, com dica "baixe o modelo: npm run transcricao:modelos" |
| 5xx | `engine_failed` |
| rede recusada | `unavailable` |
| estouro de prazo | `timeout` |

**Prazo:** o maior entre 120 s e 3× a duração prevista.

**Saúde:** `GET {URL}/health` com 200 dá `health() = true`. É sondada a cada 30 s e vira a métrica `transcriber_up`.

## 5. Download de modelos

`npm run transcricao:modelos -- <id> [<id>...]` pede ao motor que baixe os modelos, pelo mecanismo confirmado no spike (`POST /v1/models/{id}` ou `PRELOAD_MODELS`). A saída mostra só o id e o tamanho.

Candidatos da medição:
- `Systran/faster-whisper-small`;
- `Systran/faster-whisper-medium`;
- o id do `large-v3-turbo` que o registro do Speaches listar.

## 6. Idempotência

Transcrever o mesmo áudio duas vezes produz duas versões só quando o job pede uma versão nova. O job de processamento não cria outra versão se já houver uma ativa para o mesmo anexo, motor e modelo (ver `job-media-process.md`).
