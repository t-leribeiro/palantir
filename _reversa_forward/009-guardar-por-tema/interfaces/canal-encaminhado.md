# Interface: mensagem direta encaminhada no canal (contrato do canal 1.4.0, sem mudança de esquema)

> Feature: `009-guardar-por-tema` · Decisões D-01, D-02, D-03, D-16

## 1. `CanonicalMessage` de uma mensagem direta ao agente

Campos que já existem no `contracts/channel/canonical-message.schema.json` e passam a ser preenchidos:

| Campo | Hoje | S8 |
|-------|------|----|
| `isForwarded` | sempre `false` | `contextInfo.isForwarded` da mensagem (texto, áudio, foto, vídeo, documento) |
| `quotedExternalMessageId` | ausente | `contextInfo.stanzaId`, quando o dono responde citando |
| `text` em `image` e `document` | ausente | a legenda (`caption`), até 50.000 caracteres |
| `attachments` de `audio` | `[{ id, mimeType: "audio/ogg" }]`, sem como baixar | `[{ id, mimeType, fetchRef, sizeBytes?, durationSeconds? }]`, anunciado como na captura de grupos (S4) |

- `CONTRACT_VERSION` continua `1.4.0`. Não há campo novo, só valores que o esquema já aceita.
- A suíte de contrato ganha cenários com esses campos nos dois adaptadores.

## 2. Provedor WhatsApp (`provider.ts`, `mapping.ts`, `baileys-provider.ts`)

```ts
export interface IncomingDirect {
  // ... campos atuais
  /** Encaminhada (feature 009, D-02). */
  readonly isForwarded?: boolean;
  /** Id da mensagem citada pelo "responder" do WhatsApp. */
  readonly quotedId?: string;
  /** Legenda de foto, vídeo ou documento. */
  readonly caption?: string;
  /** Áudio anunciado, como em `IncomingGroupMessage.media` (baixado só se for guardado). */
  readonly media?: IncomingMedia;
}
```

- `mapping.ts`:
  - `contextOf(content)` lê `contextInfo` do tipo da mensagem (`extendedTextMessage`, `imageMessage`, `videoMessage`, `documentMessage`, `audioMessage`) e de `documentWithCaptionMessage.message.documentMessage`;
  - `captionOf(content)` lê a legenda.
- `baileys-provider.ts`: `toDirect` usa `announceMedia` para o áudio, como `toGroup`. O `recentMedia` guarda a mensagem por 15 min, acima da espera de 10 min.
- `simulated-provider.ts`: `deliverDirect` aceita os mesmos campos, e o áudio é servido pelo `downloadMedia` simulado.
- O canal (`whatsapp-channel.ts`, `toCanonical`) copia os campos para o `CanonicalMessage`. A figurinha continua como `image` sem texto.

## 3. Canal de teste: `POST /channels/fake/agent` (OpenAPI, aditivo)

```yaml
FakeAgentMessage:
  type: object
  required: [senderAccountId]
  properties:
    senderAccountId: { type: string }
    text: { type: string, maxLength: 50000 }
    messageId: { type: string, maxLength: 200, description: "Id externo; gerado se ausente." }
    kind: { type: string, enum: [text, audio, image, document], default: text }
    isForwarded: { type: boolean, default: false }
    quotedMessageId: { type: string, maxLength: 200 }
    caption: { type: string, maxLength: 50000 }
    audioBase64: { type: string, description: "Áudio Ogg; servido pelo fetchMedia do canal de teste." }
```

- `text` deixa de ser obrigatório quando `kind` não é `text`.
- O pedido sem os campos novos se comporta como hoje.

## 4. Erros e limites

- Áudio acima de 64 MB ou não baixável: o preparo da S4 marca o anexo `failed` ou `expired`, e o agente responde `failed` ao guardar (ver comandos-guardar §2).
- Encaminhado sem `senderPhone` resolvido (LID sem mapeamento): descartado como hoje (`unknownSender`).
- Idempotência: o recibo da S2 (`agent_inbound_receipts`) impede que um encaminhado reentregue entre duas vezes na espera, e a ingestão deduplica pelo id externo na fonte Guardados.
