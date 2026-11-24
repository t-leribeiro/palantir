# Interface: contrato do canal 1.3.0 (mídia)

> Feature `005-perguntar-sobre-audios` · D-03, D-15 e D-18 do roadmap · ADR-0004 (schema-first, versão aditiva)

Todas as mudanças são aditivas: `CONTRACT_VERSION` vai de `1.2.0` para `1.3.0`. Os tipos em `generated.ts` são regerados de `contracts/channel/*.schema.json` (`npm run contracts:generate`).

## 1. `KnowledgeChannel.fetchMedia`

```ts
export interface MediaContent { readonly bytes: Uint8Array; readonly mimeType: string }

export interface KnowledgeChannel {
  // ... membros da 1.2.0
  /** Baixa o binário de um anexo anunciado em `attachments[].fetchRef`. Só para fonte autorizada. */
  fetchMedia(fetchRef: string): Promise<MediaContent>;
}
```

| Situação | Comportamento |
|----------|---------------|
| `supportsMedia: false` | `fetchMedia` rejeita com `MediaUnavailableError("unsupported")` |
| `fetchRef` desconhecida ou expirada (WhatsApp: mais de 15 min, ou fora do mapa de 500) | `MediaUnavailableError("expired")`, sem nova tentativa |
| Falha de rede ou do provedor | `MediaUnavailableError("download_failed")`; quem chama tenta 3 vezes (1, 2 e 4 s) |
| Arquivo acima de 64 MB | `MediaUnavailableError("too_large")` |

Capacidades: `whatsapp` e `fake` passam a declarar `supportsMedia: true`.

## 2. `CanonicalMessage.attachments[]`

Campos novos e opcionais (`canonical-message.schema.json`):

| Campo | Tipo | Regra |
|-------|------|-------|
| `sha256` | string `^[0-9a-f]{64}$` | preenchido pelo núcleo depois de preparar o anexo |
| `durationSeconds` | number ≥ 0 | o provedor informa quando sabe (WhatsApp `seconds`); o núcleo confere pelo Ogg |
| `status` | `stored` \| `unavailable` | preenchido pelo núcleo; ausente = ainda não preparado |
| `unavailableReason` | `missing_in_export` \| `download_failed` \| `too_large` | só com `status = unavailable` |

Regras do schema:
- `kind = audio` exige `attachments` com pelo menos 1 item;
- `storageKey` só com `status = stored`.

Na entrada da ingestão, um anexo com `fetchRef` e sem `status` é recusado (`invalid`): o núcleo prepara antes de ingerir.

## 3. `Citation` (resposta do agente)

| Campo novo | Tipo | Regra |
|------------|------|-------|
| `kind` | `text` \| `audio` \| … | o tipo da mensagem citada |
| `audioStartS` | number ≥ 0 | início do trecho citado, só para áudio |
| `audioEndS` | number ≥ `audioStartS` | fim do trecho |

O texto da resposta (ADR-0007, determinístico) para áudio:

```
Encontrei 1 mensagem sobre isso:

1. Ana em T3, 12/11/2026, áudio de 1:42, aos 0:37: “…trecho transcrito…” [1]
```

- O tempo aparece como `m:ss`, ou `h:mm:ss` acima de 1 h.
- Sem duração conhecida, o trecho "áudio de …" é omitido.
- O trecho transcrito segue o limite de 280 caracteres.

## 4. Provedor do WhatsApp (interno ao adaptador)

`IncomingGroupMessage` ganha `media?: { kind: "audio" | "image" | "video" | "document" | "sticker" | "other"; mimeType: string; seconds?: number; sizeBytes?: number; fetchRef: string }`, e o provedor ganha `downloadMedia(fetchRef): Promise<Uint8Array>`. Só o `baileys-provider.ts` importa a biblioteca. O provedor simulado ganha `deliverGroupAudio` e um modo que falha o download N vezes.

## 5. Suíte de contrato

Os testes de mídia passam a rodar, hoje pulados por `supportsMedia: false`:
- áudio anunciado tem `fetchRef` e `fetchMedia` devolve os bytes;
- `fetchRef` inválida rejeita com `MediaUnavailableError`;
- a falha de download não perde a mensagem.

Rodam para `fake` e para o WhatsApp simulado.
