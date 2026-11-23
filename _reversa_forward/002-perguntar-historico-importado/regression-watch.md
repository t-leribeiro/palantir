# Regression watch: Perguntar ao histórico importado (fatia S1)

> Identificador: `002-perguntar-historico-importado`
> Feature greenfield: nenhuma regra 🟢 extraída de código para vigiar ainda.

## Watch principal

| ID | Origem (arquivo, seção) | Regra esperada após mudança | Tipo de verificação | Sinal de violação |
|----|-------------------------|-----------------------------|---------------------|-------------------|

(vazio até uma extração `/reversa` confirmar as regras abaixo como 🟢)

## Observações

| ID | Origem | Regra implementada | Verificada por |
|----|--------|--------------------|----------------|
| W001 | `_reversa_sdd/sdd/whatsapp-export-importer.md#RF-02` | Formatos Android e iOS, pt-BR e en, com multilinha, são interpretados | `test/unit/whatsapp-export/parse.test.ts` |
| W002 | `_reversa_sdd/sdd/whatsapp-export-importer.md#RF-05` / `ingestion.md#RF-03` | Reimportar não duplica (chave determinística por conversa, minuto, autor, texto e ordinal) | `test/unit/whatsapp-export/*`, `test/e2e/import-history.test.ts` |
| W003 | `_reversa_sdd/sdd/ingestion.md#11` (EC-01) | Mensagens iguais do mesmo autor no mesmo minuto continuam distintas | `test/unit/whatsapp-export/keys.test.ts`, `test/e2e/import-history.test.ts` |
| W004 | `_reversa_sdd/sdd/whatsapp-export-importer.md#RF-07` | Mensagens de sistema e apagadas não ficam pesquisáveis | `test/unit/whatsapp-export/parse.test.ts` |
| W005 | `_reversa_sdd/sdd/whatsapp-export-importer.md#7` (RNF-03) | ZIP inseguro (path traversal, > 100:1, > 2 GB, sem `.txt`) é recusado sem gravar nada | `test/unit/whatsapp-export/zip.test.ts`, `test/e2e/import-history.test.ts` |
| W006 | `_reversa_sdd/sdd/whatsapp-export-importer.md#11` (EC-01) | Formato não reconhecido ou data ambígua recusam o arquivo inteiro antes de criar a fonte | `test/unit/whatsapp-export/importer.test.ts` |
| W007 | `_reversa_sdd/sdd/identity-and-sources.md#RF-04` | Importar autoriza a conversa na conta `whatsapp` do dono, que fica `pending` e não identifica ninguém no agente | `test/integration/postgres.test.ts` |
| W008 | `_reversa_sdd/sdd/channel-contract.md#RF-08` | Contrato 1.1.0 exige `importKey` em `export_import` e aceita mensagens 1.0.0 | `test/unit/contracts/validator.test.ts` |
| W009 | `_reversa_forward/002-perguntar-historico-importado/requirements.md#6` | Erros e relatório nunca mostram o texto das mensagens (só o padrão da linha) | `test/unit/whatsapp-export/parse.test.ts` |

## Histórico de re-extrações

(vazio)

## Arquivadas

(vazio)
