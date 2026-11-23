# Interface: contrato do canal

> Identificador: `001-walking-skeleton`
> Tipo: esquema (JSON Schema 2020-12) + porta em processo
> Origem: `_reversa_sdd/sdd/channel-contract.md`
> Versão do contrato: `1.0.0`

## 1. Arquivos

| Arquivo | Conteúdo |
|---------|----------|
| `contracts/channel/canonical-message.schema.json` | Esquema de `CanonicalMessage` |
| `contracts/channel/agent-reply.schema.json` | Esquema de `AgentReply` |
| `src/contracts/channel/*.ts` | Tipos gerados (não editar à mão); a CI falha se diferirem do gerado |
| `src/contracts/channel/knowledge-channel.ts` | Porta `KnowledgeChannel` |

## 2. `CanonicalMessage`

| Campo | Tipo | Obrigatório | Regra |
|-------|------|-------------|-------|
| contractVersion | string | sim | semver; maior diferente de 1 é rejeitado |
| id | string (uuid) | sim | gerado pelo adaptador |
| source.provider | string | sim | texto livre, `^[a-z][a-z0-9-]{1,31}$` |
| source.accountId | string | sim | conta de canal que capturou |
| source.conversationId | string | sim | id externo da conversa |
| source.externalMessageId | string | não | ausente só em `export_import` |
| sender.externalId | string | sim | |
| sender.displayName | string | não | |
| timestamp | string | sim | ISO 8601 com fuso obrigatório |
| kind | enum | sim | `text`, `audio`, `image`, `document`, `link` |
| text | string | não | obrigatório quando `kind` = `text` ou `link`; máximo 50.000 caracteres |
| quotedExternalMessageId | string | não | |
| isForwarded | boolean | sim | |
| attachments | array | sim | pode ser vazio; itens `{id, mimeType, sizeBytes?, storageKey?, fetchRef?}` |
| provenance.captureMethod | enum | sim | `live`, `export_import`, `forwarded_to_agent` |
| provenance.capturedAt | string | sim | ISO 8601 com fuso |
| provenance.adapter | string | sim | ex.: `fake` |

`additionalProperties: false` em todos os objetos.

## 3. `AgentReply`

| Campo | Tipo | Obrigatório | Regra |
|-------|------|-------------|-------|
| text | string | sim | Markdown restrito: negrito, itálico, listas |
| citations | array | sim | itens `{index, messageId, author, sourceTitle, sentAt}`; pode ser vazio só quando `outcome` = `no_evidence` |
| outcome | enum | sim | `answered`, `no_evidence`, `error` |

## 4. Porta `KnowledgeChannel`

```text
connect(): Promise<void>
disconnect(): Promise<void>
capabilities(): { supportsLiveCapture, supportsHistory, supportsMedia, maxMessageLength }
listConversations(): Promise<ConversationRef[]>
onMessage(handler: (msg: CanonicalMessage) => Promise<IngestOutcome>): void
onAgentMessage(handler: (msg: CanonicalMessage) => Promise<AgentReply>): void
sendReply(destinationAccountId: string, reply: AgentReply): Promise<void>
```

- O adaptador separa mensagens de fontes capturadas (`onMessage`) de mensagens dirigidas ao agente (`onAgentMessage`).
- `sendReply` aplica a renderização do canal (no fake: guarda o `AgentReply` intacto e uma versão renderizada em texto).

## 5. Erros de validação

| Código | Quando | Exemplo de detalhe |
|--------|--------|--------------------|
| `contract.invalid` | Falha de esquema | `{"path":"/timestamp","message":"must have required property"}` |
| `contract.version_unsupported` | `contractVersion` maior ≠ 1 | `{"received":"2.0.0"}` |

Mensagem inválida é descartada e conta em `channel_invalid_messages_total{adapter}`.

## 6. Idempotência e timeouts

- Idempotência é responsabilidade da ingestão (chave `source_id` + `external_message_id`); o adaptador pode reentregar.
- O handler de `onMessage` tem timeout de 5 s; o adaptador faz 3 tentativas com backoff (200 ms, 1 s, 5 s).
