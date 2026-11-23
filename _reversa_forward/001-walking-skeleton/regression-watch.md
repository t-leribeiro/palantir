# Regression watch: Walking skeleton da platform-foundation

> Identificador: `001-walking-skeleton`
> Feature greenfield: nenhuma regra 🟢 extraída de código existente para vigiar ainda.

## Watch principal

| ID | Origem (arquivo, seção) | Regra esperada após mudança | Tipo de verificação | Sinal de violação |
|----|-------------------------|-----------------------------|---------------------|-------------------|

(vazio: os itens abaixo sobem para cá quando uma extração `/reversa` sobre o código novo os confirmar como 🟢)

## Observações

Regras implementadas nesta feature, com origem nas specs 🟡. Sem peso de regressão até serem confirmadas por uma extração.

| ID | Origem | Regra implementada | Verificada por |
|----|--------|--------------------|----------------|
| W001 | `_reversa_sdd/sdd/channel-contract.md#RF-02` | `source.provider` é texto livre; importação é `captureMethod`, não provedor | `test/unit/contracts/validator.test.ts` |
| W002 | `_reversa_sdd/sdd/channel-contract.md#RF-03` | Toda `CanonicalMessage` é validada por schema antes da ingestão; erro indica o campo | `test/unit/contracts/validator.test.ts`, `test/unit/http/fake-routes.test.ts` |
| W003 | `_reversa_sdd/sdd/channel-contract.md#RF-08` | Contrato com versão maior diferente de 1 é rejeitado com `contract.version_unsupported` | `test/unit/contracts/validator.test.ts` |
| W004 | `_reversa_sdd/sdd/channel-contract.md#RF-07` | Todo adaptador passa a suíte de contrato; o núcleo não importa `src/channels/**` | `test/contract/*`, `.dependency-cruiser.cjs` |
| W005 | `_reversa_sdd/sdd/identity-and-sources.md#RF-04` | Fonte sem autorização (ou revogada) não aceita mensagens; fonte em exclusão é recusada | `test/unit/identity-sources/*`, `test/unit/ingestion/*` |
| W006 | `_reversa_sdd/sdd/identity-and-sources.md#RF-09` | Só conta de canal `active` identifica um usuário | `test/unit/identity-sources/*` |
| W007 | `_reversa_sdd/sdd/ingestion.md#RF-02` | A mesma mensagem (fonte + id externo) é gravada uma única vez | `test/unit/ingestion/*` |
| W008 | `_reversa_sdd/sdd/ingestion.md#RF-07` | Gravação e enfileiramento da indexação acontecem juntos ou não acontecem | `test/unit/ingestion/*` |
| W009 | `_reversa_sdd/sdd/retrieval.md#RF-01` | Nenhuma busca sem espaço do usuário | `test/unit/knowledge-retrieval/*` |
| W010 | `_reversa_sdd/sdd/conversational-agent.md#RF-04` | Toda citação aponta para mensagem presente nos resultados; "answered" exige citação | `test/unit/agent/*` |
| W011 | `_reversa_sdd/sdd/conversational-agent.md#RF-05` | Baixa confiança ou sem resultados gera "Não encontrei evidências suficientes." | `test/unit/agent/*` |
| W012 | `_reversa_sdd/sdd/platform-foundation.md#RNF-05` | 5 regras de arquitetura obrigatórias ativas, cada uma com fixture de violação | `test/architecture/rules.test.ts` |
| W013 | `_reversa_sdd/sdd/platform-foundation.md#RNF-06` | Complexidade ciclomática ≤ 10; exceção só com registro e revisor | `test/quality/complexity.test.ts` |
| W014 | `_reversa_sdd/sdd/channel-contract.md#12` | Logs nunca contêm o texto de mensagens, buscas, respostas nem credenciais | `test/unit/platform/logger.test.ts` |
| W015 | `_reversa_sdd/sdd/ingestion.md#RF-07` | Se a transação falha, nem a mensagem nem o job ficam gravados (pg-boss na mesma transação) | `test/integration/postgres.test.ts` |
| W016 | `_reversa_sdd/sdd/identity-and-sources.md#RF-07` | Excluir a fonte apaga mensagens, participantes, proveniência e trechos (cascata) | `test/integration/postgres.test.ts` |
| W017 | `_reversa_sdd/sdd/retrieval.md#RF-08` | Palavras de pergunta não contam como evidência; score = fração de termos presentes; limiar padrão 0,5 | `test/integration/postgres.test.ts`, `npm run eval` |
| W018 | `_reversa_sdd/sdd/platform-foundation.md#RF-07` | Caminho ponta a ponta com citação e "não encontrei" | `test/e2e/walking-skeleton.test.ts` |

## Histórico de re-extrações

(vazio)

## Arquivadas

(vazio)
