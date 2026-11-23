# ADR-0005: Testes de arquitetura e limite de complexidade ciclomática

- Status: aceito
- Data: 2026-11-22
- Decisores: Leandro (produto), reversa-plan
- Origem: `_reversa_forward/001-walking-skeleton/roadmap.md` (D-15, D-16); RNF-05 e RNF-06 de `_reversa_sdd/sdd/platform-foundation.md`

## Contexto

O usuário incluiu testes de arquitetura e complexidade ciclomática como requisitos não funcionais do sistema. As fronteiras do monólito modular (ADR-0001) e a independência do núcleo em relação aos canais (ADR-0004) só se mantêm se forem verificadas automaticamente.

## Decisão

### Testes de arquitetura (dependency-cruiser, `.dependency-cruiser.cjs`)

| Regra | Proíbe |
|-------|--------|
| `core-no-channels` | `src/modules/**` importar `src/channels/**` |
| `domain-pure` | `domain/` importar `application/`, `infrastructure/`, `src/platform/**` ou pacotes de infraestrutura |
| `application-no-infra` | `application/` importar `infrastructure/` ou `src/platform/**` |
| `module-public-api-only` | um módulo importar arquivo interno de outro módulo (só `src/modules/<outro>/index.ts`) |
| `no-module-cycles` | ciclos de dependência |

Cada regra tem fixture de violação testada em `test/architecture/rules.test.ts`.

### Complexidade (ESLint `complexity`)

- Limite: **10 por função ou método**, regra `error`.
- Exceção só com `// eslint-disable-next-line complexity -- <justificativa>` **e** registro em `quality/complexity-exceptions.json` (arquivo, função, justificativa, revisor). `npm run complexity:check` falha se um lado existir sem o outro.
- `npm run complexity:report` publica a complexidade média e máxima por módulo.

Ambos rodam no pre-commit (lefthook) e na esteira, bloqueando commit e merge.

## Consequências

- Positivas: erosão arquitetural detectada no commit; funções pequenas e testáveis; mutation testing mais barato.
- Negativas: refatorações ocasionais para caber no limite; exceções exigem revisão.

## Pendência

OQ-04 de `platform-foundation`: confirmar o limite 10 (ou 8) e se a complexidade cognitiva entra como complemento.
