# Interface: API HTTP do walking skeleton

> Identificador: `001-walking-skeleton`
> Tipo: HTTP (OpenAPI 3.1 em `contracts/openapi.yaml`)
> Base: `http://localhost:8080`

Endpoints `/v1/channels/fake/*` só existem quando `PALANTIR_FAKE_CHANNEL=true`. Nunca habilitar fora do ambiente local e de teste.

## GET /health

- **200** `{"status":"ok","checks":{"db":"ok","queue":"ok"}}`
- **503** `{"status":"degraded","checks":{"db":"fail","queue":"ok"}}`

## POST /v1/channels/fake/inbound

Injeta uma mensagem como se tivesse sido capturada em uma conversa.

Request:

```json
{
  "conversationId": "fake-group-1",
  "externalMessageId": "m-1",
  "senderId": "ana",
  "senderName": "Ana",
  "text": "O Grafana Alloy centraliza a coleta de telemetria",
  "timestamp": "2026-11-22T10:00:00-03:00"
}
```

Responses:

| Status | Corpo | Quando |
|--------|-------|--------|
| 202 | `{"outcome":"accepted","messageId":"<uuid>"}` | Gravada e indexação enfileirada |
| 200 | `{"outcome":"duplicate","messageId":"<uuid>"}` | Mesma `conversationId` + `externalMessageId` já gravada |
| 403 | `{"error":"source.not_authorized"}` | Fonte inexistente ou não autorizada |
| 400 | `{"error":"contract.invalid","details":[...]}` | Falha de esquema |

Idempotente por (`conversationId`, `externalMessageId`).

## POST /v1/channels/fake/agent

Envia uma mensagem ao agente como o usuário dono da conta.

Request: `{"senderAccountId":"fake-operator","text":"quem falou do Grafana Alloy?"}`

Responses:

| Status | Corpo | Quando |
|--------|-------|--------|
| 200 | `AgentReply` com `outcome` `answered` ou `no_evidence` | Pergunta processada |
| 200 | `AgentReply` com instruções de vínculo e `outcome` `no_evidence` | Conta não vinculada (nenhuma busca executada) |
| 400 | `{"error":"contract.invalid"}` | Corpo inválido |
| 503 | `{"error":"agent.unavailable"}` | Banco indisponível |

Timeout do servidor: 15 s.

## GET /v1/channels/fake/outbox

Lista as respostas entregues pelo adaptador fake, mais recente primeiro.

- **200** `{"items":[{"destinationAccountId":"fake-operator","reply":{...AgentReply},"rendered":"...","sentAt":"..."}]}`
- Query `?limit=` (padrão 20, máximo 100).

## DELETE /v1/channels/fake/outbox

Limpa o registro de respostas (uso em testes). **204**.

## Observabilidade

Todas as rotas geram span HTTP (auto-instrumentação) e propagam `traceparent`. Corpos de request e response nunca são logados.
