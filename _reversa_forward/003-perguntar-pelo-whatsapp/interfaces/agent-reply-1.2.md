# Interface: AgentReply 1.2.0

> Arquivo do contrato: `contracts/channel/agent-reply.schema.json` (fonte da verdade; tipos gerados por `npm run contracts:generate`).
> Versão anterior: 1.1.0 (feature 002). Mudança **aditiva**.

## Delta

| Campo | 1.1.0 | 1.2.0 |
|-------|-------|-------|
| `outcome` | `answered` \| `no_evidence` \| `error` | `answered` \| `no_evidence` \| `error` \| **`help`** |

- `help`: ajuda curta, sem busca e sem citações (`citations: []`). O texto tem no máximo 600 caracteres e pelo menos 2 exemplos de perguntas (RF-14).
- A regra condicional atual continua: só `answered` exige citações.
- `CONTRACT_VERSION` passa para `1.2.0` em `src/contracts/channel/knowledge-channel.ts`.

## Porta do canal (TypeScript, não é schema)

`AgentHandler` passa a ser `(message: CanonicalMessage) => Promise<AgentReply | null>`:

- `null` significa que o canal **não envia nada**. Hoje só acontece com remetente desconhecido quando o canal usa a política `silent` (RF-05).
- O adaptador fake continua recebendo a resposta de "não vinculado" (política `reply`), então o walking skeleton não muda.

## Compatibilidade

- Consumidores: os renderizadores do fake e do WhatsApp tratam `help` como texto comum.
- A suíte de contrato ganha um caso: uma resposta `help` é entregue dentro do limite do canal.
- Teste do validador: `help` com citações vazias é válido; um `outcome` desconhecido continua inválido.
