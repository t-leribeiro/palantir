# Interface: health do processo WhatsApp

> Feature: `004-captura-ao-vivo-grupo-teste` (RF-10, RF-11; D-01, D-16)
> Base: `_reversa_forward/003-perguntar-pelo-whatsapp/interfaces/cli-whatsapp.md` (health em `127.0.0.1:${PALANTIR_WHATSAPP_HEALTH_PORT}/health`)

## Resposta

```json
{ "status": "ok", "checks": { "db": "ok", "whatsapp": "connected", "capture": "connected" } }
```

| `PALANTIR_WHATSAPP_CAPTURE` | `checks.capture` |
|-----------------------------|------------------|
| `off` | `"off"` (não entra no cálculo do status) |
| `agent` | Mesmo estado de `checks.whatsapp`, porque é a mesma sessão |
| `dedicated` | Estado da sessão de captura: `pairing`, `connected`, `reconnecting` ou `logged_out` |

- HTTP 200 quando `db` é `ok`, `whatsapp` é `connected` e `capture` é `connected` ou `off`. Nos demais casos, 503, como na S2.
- O tipo `HealthStatus` da plataforma ganha o valor `off`.
- No `contracts/openapi.yaml`, o enum do health passa a incluir `off`, mantendo o drift zero.

## QR do modo `dedicated`

O processo pode ter de mostrar dois QR: o do agente, quando não houver sessão, e o da captura. Cada um sai no terminal com um título antes do desenho: `Número do AGENTE: leia com o celular do chip do agente` ou `Número de CAPTURA: ...`. Os QR continuam fora do logger.
