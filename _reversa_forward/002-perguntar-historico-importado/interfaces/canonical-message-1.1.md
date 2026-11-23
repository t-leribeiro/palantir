# Interface: CanonicalMessage 1.1.0

> Identificador: `002-perguntar-historico-importado`
> Base: `_reversa_forward/001-walking-skeleton/interfaces/channel-contract.md` (1.0.0)
> Tipo de mudança: aditiva (compatível com adaptadores 1.0.0)

## Mudanças

| Campo | Tipo | Obrigatório | Regra |
|-------|------|-------------|-------|
| `source.importKey` | string | quando `provenance.captureMethod = export_import` | 64 caracteres hexadecimais (SHA-256); identifica a mensagem dentro da fonte para deduplicar reimportações |
| `contractVersion` | string | sim | adaptadores novos enviam `1.1.0`; o núcleo aceita qualquer `1.x` |

## Exemplo

```json
{
  "contractVersion": "1.1.0",
  "source": {
    "provider": "whatsapp",
    "accountId": "unlinked:7c1e…",
    "conversationId": "export:comunidade-devops",
    "importKey": "9f2b…(64 hex)"
  },
  "sender": { "externalId": "diego", "displayName": "Diego" },
  "timestamp": "2026-11-10T13:00:00.000Z",
  "kind": "text",
  "text": "Recomendo o Temporal para workflows longos",
  "isForwarded": false,
  "attachments": [],
  "provenance": { "captureMethod": "export_import", "capturedAt": "2026-11-23T10:00:00.000Z", "adapter": "whatsapp-export" }
}
```

## Idempotência

A ingestão grava no máximo uma mensagem por (`fonte`, `importKey`); a repetição devolve `duplicate` com o id existente.
