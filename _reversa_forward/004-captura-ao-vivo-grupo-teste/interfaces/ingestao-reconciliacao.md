# Interface: saída da ingestão com reconciliação

> Feature: `004-captura-ao-vivo-grupo-teste` (RF-06, RF-07; D-09, D-10)
> Arquivos: `src/contracts/channel/knowledge-channel.ts` (`IngestOutcome`), `src/modules/ingestion/*`, `src/channels/whatsapp-export/importer.ts`, `src/main/import.ts`

## `IngestOutcome`

Novo membro, aditivo: os consumidores atuais tratam `accepted`, `duplicate` e `rejected` e passam a tratar `reconciled`.

```ts
| { readonly outcome: "reconciled"; readonly messageId: string }
```

| Resultado | Quando |
|-----------|--------|
| `accepted` | Mensagem nova gravada; job de indexação enfileirado na mesma transação |
| `duplicate` | A chave da própria mensagem já existia (`external_message_id` ao vivo ou `import_key` importada) |
| `reconciled` | Não havia a chave, mas outra mensagem da mesma fonte casou pela regra RN-04. A chave que faltava foi gravada nela e a proveniência acrescentada, sem novo job de indexação (o texto não mudou) |
| `rejected` | Fonte não autorizada, inválida ou em exclusão (sem mudança) |

`IngestOutcome` é um tipo TypeScript do contrato do canal, não um JSON Schema publicado. A versão do contrato (`CONTRACT_VERSION = "1.2.0"`) continua a mesma, porque `CanonicalMessage` e `AgentReply` não mudam. A mudança fica registrada no ADR-0004 como nota.

## Regra de reconciliação

Entrada: mensagem com `importKey` e sem `externalMessageId` (importada), ou com `externalMessageId` e sem `importKey` (ao vivo), cuja chave ainda não existe na fonte.

Candidatas:
- mesma `source_id`;
- `sent_at` entre `t − 60 s` e `t + 60 s`;
- texto normalizado igual: NFC, minúsculas, espaços colapsados e aparados;
- para uma importada: candidatas com `import_key` nulo, ou seja, ao vivo e ainda não reconciliadas;
- para uma ao vivo: candidatas com `external_message_id` nulo, ou seja, importadas e ainda não reconciliadas.

Escolha da candidata:
1. Menor `|Δt|`.
2. Em empate, a candidata cujo `display_name` do autor, normalizado, for igual ao nome da mensagem que chega.
3. Persistindo o empate, o menor `sent_at` e depois o menor `id`. A ordem é determinística, como no ordinal da chave da S1.

A candidata escolhida é travada com `FOR UPDATE` na transação, para evitar que captura e importação simultâneas casem a mesma mensagem duas vezes. Mensagens sem texto nunca reconciliam.

## Relatório da importação (`npm run import`)

Linha nova, entre "Já existentes" e "Mensagens de sistema":

```
Reconciliadas com a captura ao vivo: 20
```

A linha aparece só quando o valor for maior que 0. A soma `importadas + já existentes + reconciliadas` é igual ao total de mensagens de texto do arquivo.

## Métrica

`ingestion_messages_total{outcome}` ganha `outcome="reconciled"`, mantendo os rótulos existentes.
