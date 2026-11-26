# Interface: anexo de áudio na resposta (contrato do canal 1.4.0)

> Feature: `008-mostrar-original-com-contexto` · Decisões D-07 a D-10, D-14

## 1. `AgentReply.media` (JSON Schema, aditivo)

Em `contracts/channel/agent-reply.schema.json`:

```json
"media": {
  "type": "array",
  "maxItems": 1,
  "description": "Anexo entregue depois do texto, por referência (1.4.0). Nunca leva bytes.",
  "items": {
    "title": "ReplyMedia",
    "type": "object",
    "additionalProperties": false,
    "required": ["kind", "ref", "mimeType", "sizeBytes", "failureText"],
    "properties": {
      "kind": { "type": "string", "enum": ["audio"] },
      "ref": { "type": "string", "format": "uuid", "description": "Id do anexo (attachments.id)." },
      "mimeType": { "type": "string", "minLength": 1 },
      "durationSeconds": { "type": "number", "minimum": 0 },
      "sizeBytes": { "type": "integer", "minimum": 1, "maximum": 16777216 },
      "failureText": { "type": "string", "minLength": 1, "maxLength": 500, "description": "Enviado pelo adaptador se não conseguir entregar o anexo." }
    }
  }
}
```

- `media` é opcional: toda resposta 1.3.0 continua válida.
- `CONTRACT_VERSION = "1.4.0"`. Os tipos em `src/contracts/channel/generated.ts` são regenerados com `npm run contracts:generate`, nunca à mão.
- O OpenAPI do canal de teste (`contracts/openapi.yaml`) referencia o schema; nada muda nele além da referência.

## 2. Porta `OutboundMediaLoader` (em `src/contracts/channel/knowledge-channel.ts`)

```ts
/** Busca os bytes de um anexo da resposta (1.4.0). Só para a conta dona do espaço do anexo. */
export type OutboundMediaLoader = (destinationAccountId: string, ref: string) => Promise<MediaContent>;
```

- O `src/main` injeta a porta em cada adaptador, como opção de construção. Sem ela, o adaptador trata a resposta como sem mídia: manda o `failureText` e conta `missing`.
- Falhas: `MediaUnavailableError("expired")` quando o anexo não existe, é de outro espaço ou não está guardado; `MediaUnavailableError("download_failed")` quando o armazenamento está fora do ar.

**Implementação (módulo `media`, montada no `src/main`):**
1. Resolver a conta de destino (`channel_accounts`, `status = 'active'`) e obter o espaço.
2. Ler o anexo: `id = ref AND space_id = <espaço> AND storage_status = 'stored'`.
3. `ObjectStore.get(storage_key)`, que decifra com AES-256-GCM (ADR-0010).
4. Conferir o SHA-256 com o `sha256` registrado.
5. Devolver `{ bytes, mimeType }`, só na memória.

Nada vai para log além de `outcome` e do id do anexo.

## 3. Comportamento do `sendReply` com `media`

| Situação | Adaptador WhatsApp | Canal de teste |
|----------|--------------------|----------------|
| Texto e anexo, loader ok | Manda as partes do texto e depois `sendAudio`, pelo `pacer` | `outbox` registra o texto e `{ ref, kind, mimeType, sizeBytes, sha256 }` dos bytes carregados |
| Loader falha | Manda o `failureText` como texto; métrica `failed` | Registra o `failureText` e `mediaOutcome: "failed"` |
| Sem loader injetado | Manda o `failureText`; métrica `missing` | Registra `mediaOutcome: "missing"` |
| Envio do áudio falha depois das tentativas | Manda o `failureText`; métrica `failed` | — |

- Destino de grupo continua proibido: `sendAudio` recusa JID `@g.us`.
- O anexo só vai para o mesmo destino do texto: a conta que fez o pedido.

**Métrica:** `channel_media_sent_total{adapter, outcome}`, com `sent`, `failed` e `missing`.

## 4. `WhatsAppProvider.sendAudio`

```ts
/** Mensagem de voz (feature 008, D-09). Recusa grupo, como sendText. */
sendAudio(chatJid: string, audio: Uint8Array, mimeType: string, seconds?: number): Promise<void>;
```

- **Baileys** (só em `baileys-provider.ts`): `socket.sendMessage(chatJid, { audio: Buffer.from(audio), mimetype: mimeType, ptt: true, ...(seconds ? { seconds: Math.round(seconds) } : {}) })`, com o mesmo `SEND_TIMEOUT_MS` do texto.
- **Simulador:** guarda `{ chatJid, mimeType, bytes.length, sha256 }` na lista de enviados.

## 5. Suíte de contrato (`test/contract/channel-contract-suite.ts`)

Cenários novos, executados no canal de teste e no WhatsApp simulado:
1. Resposta com `media` e loader ok entrega o texto e depois o anexo, com o mesmo SHA-256.
2. Loader que falha entrega o `failureText`.
3. Resposta sem `media` continua igual a 1.3.0.

> Execução (2026-11-25):
> - No WhatsApp, a resposta a uma pergunta vai para o `chatJid` da conversa, que pode ser um LID. O loader recebe o telefone E.164 do dono (`senderPhone`), que é a conta; o envio usa o `chatJid`.
> - Hash divergente vira `expired` (não adianta tentar de novo); armazenamento fora do ar vira `download_failed`.
> - `mediaSent` é opcional no observador do WhatsApp, para não quebrar os dublês existentes.
> - Sem chave de mídia ou sem S3 no `.env`, o `src/main` não injeta o loader e avisa na subida; o canal entrega o `failureText`.
