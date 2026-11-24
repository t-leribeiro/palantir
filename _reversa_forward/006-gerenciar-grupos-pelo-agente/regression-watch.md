# Regression watch: Gerenciar grupos conversando com o agente (fatia S5)

> Identificador: `006-gerenciar-grupos-pelo-agente`
> Feature greenfield: nenhuma regra 🟢 extraída de código para vigiar ainda.

## Watch principal

| ID | Origem (arquivo, seção) | Regra esperada após mudança | Tipo de verificação | Sinal de violação |
|----|-------------------------|-----------------------------|---------------------|-------------------|

(vazio até uma extração `/reversa` confirmar as regras abaixo como 🟢)

## Observações

| ID | Origem | Regra implementada | Verificada por |
|----|--------|--------------------|----------------|
| W001 | `requirements.md#RN-01` | Só conta ativa e verificada dá ordens, e só em conversa direta; mensagem em grupo nunca é comando; o espaço vem da identidade | `test/e2e/whatsapp-management.test.ts`, `test/unit/agent/manage-sources.test.ts` |
| W002 | `requirements.md#RN-02`, `RF-01`, `RF-15` (D-11, D-12) | Conta `pending` até o código do `whatsapp:link`: 6 dígitos, hash com sal, 10 min, 5 tentativas, um código vivo; a migração devolve a `pending` as contas ativas sem verificação (exceto `fake`) | `test/unit/identity-sources/verify-account.test.ts`, `test/integration/account-verification.test.ts`, `test/integration/management-schema.test.ts` |
| W003 | `requirements.md#RN-03`, `RF-02`, `RF-08` (D-04, D-15) | Lista numerada com estados; número vale só na lista dos últimos 30 min; nome ambíguo lista as opções sem agir | `test/unit/agent/conversation-ref.test.ts`, `test/e2e/source-management.test.ts` |
| W004 | `requirements.md#RN-04`, `RF-03` (D-05, D-06) | Acompanhar exige "confirmo" em até 5 min e grava a declaração; liga à importação de mesmo nome | `test/integration/source-management.test.ts`, `test/unit/agent/manage-sources.test.ts` |
| W005 | `requirements.md#RN-05`, `RF-04` | Parar vale na próxima mensagem do grupo; o histórico continua | `test/e2e/whatsapp-management.test.ts` |
| W006 | `requirements.md#RN-06`, `RF-05`, `RF-06`, `RF-07` (D-07, D-08) | Apagar exige "confirmo apagar <nome>"; some na hora; o job apaga linhas e arquivos da fonte, é idempotente e tenta de novo; mensagens da fonte em exclusão são recusadas | `test/integration/source-deletion.test.ts`, `test/e2e/source-management.test.ts`, `test/e2e/whatsapp-management.test.ts` |
| W007 | `requirements.md#RN-07`, `RF-09` (D-13) | Auditoria de vínculo, verificação, acompanhar, parar e exclusão, só com contagens; nome só enquanto a fonte existe | `test/integration/audit-log.test.ts`, `test/unit/management/audit-cli.test.ts` |
| W008 | `requirements.md#RN-08` (D-10) | O agente só fala com quem falou com ele, exceto o aviso de exclusão, mandado uma vez pelo canal de origem | `test/unit/management/notify.test.ts`, `test/e2e/whatsapp-management.test.ts` |
| W009 | `requirements.md#RN-09`, `RF-13` | O terminal segue as mesmas regras e audita; `apagar` exige `--nome` | `test/unit/whatsapp/whatsapp-groups-cli.test.ts`, `test/e2e/whatsapp-management.test.ts` |
| W010 | `requirements.md#RN-10` | Acompanhar só com o consentimento declarado (base legal) | `test/integration/source-management.test.ts` |
| W011 | `requirements.md#RN-11`, `RF-14` (D-14) | O nome completo da conversa na pergunta restringe a busca a ela; nome repetido não busca | `test/unit/agent/ask-question.test.ts`, `test/integration/media-pipeline.test.ts`, `test/e2e/source-management.test.ts` |
| W012 | `requirements.md#RF-12` (D-16) | Métricas e painel sem nomes; alerta de exclusão parada há mais de 30 min | `test/unit/management/otel-observer.test.ts`, `promtool check rules` |
| W013 | `requirements.md#6` (privacidade) | Logs sem nome de grupo, telefone ou código; `media:conferir` sem objetos de conversa apagada | `test/e2e/whatsapp-management.test.ts`, `test/unit/scripts/media-orphans.test.ts` |

## Histórico de re-extrações

(vazio)

## Arquivadas

(vazio)
