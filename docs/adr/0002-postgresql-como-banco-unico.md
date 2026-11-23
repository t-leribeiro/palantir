# ADR-0002: PostgreSQL como banco único (NoSQL avaliado e descartado)

- Status: aceito
- Data: 2026-11-22
- Decisores: Leandro (produto), reversa-plan
- Origem: `_reversa_forward/001-walking-skeleton/roadmap.md` (D-06), `investigation.md#2.5`

## Contexto

O coração do produto é a busca: palavra exata, palavra aproximada e o mesmo assunto dito de outro jeito, com filtros por espaço do usuário, fonte, autor e período. O PRD exige que o isolamento entre usuários seja aplicado antes da recuperação. O modelo é relacional (usuário → espaço → fonte → mensagem → trecho → evidência) e depende de integridade: chaves únicas para idempotência, exclusão em cascata de uma fonte (privacidade) e mensagem imutável. A v0.1 é local-first e de custo baixo.

## Decisão

PostgreSQL 16 com `pg_trgm`, `unaccent`, busca textual em português e `pgvector`, como banco único para dados, índice de busca e fila de jobs (ADR-0003).

## Alternativas consideradas

| Opção | Por que foi descartada |
|-------|------------------------|
| DynamoDB (serverless) | Sem busca textual nem vetorial nativa: exigiria OpenSearch sincronizado à parte, com risco de inconsistência entre os dois e isolamento dependente de outro sistema. Sem FKs nem cascata. Exige desenhar padrões de acesso de antemão (single-table design), o que não combina com uma fase de descoberta. DynamoDB Local é emulador sem busca, e o serviço prende o projeto à AWS. |
| MongoDB | Busca textual e vetorial completas ligadas principalmente ao Atlas (nuvem); na versão self-managed esses recursos são recentes ou limitados. Sem FKs nem cascata: idempotência, exclusão e imutabilidade virariam código da aplicação. |

## Consequências

- Positivas: busca híbrida e filtro de isolamento na mesma query; integridade garantida pelo banco; roda igual na máquina, na CI e em qualquer nuvem.
- Negativas: escala vertical primeiro; volumes muito grandes exigiriam particionamento ou um armazenamento auxiliar.

## Critério de reavaliação

Reabrir esta decisão se ocorrer qualquer um:

1. Arquivo bruto de mensagens na ordem de bilhões de registros (cenário multiusuário em produção).
2. Operação multi-região com escrita local.

Nesse caso, avaliar um armazenamento de log bruto (object storage ou NoSQL) ao lado do PostgreSQL, que continua com índice e evidências. Os repositórios atrás de portas na camada de aplicação limitam o impacto.
