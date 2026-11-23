# Regression watch: Captura ao vivo de um grupo de teste autorizado (fatia S3)

> Identificador: `004-captura-ao-vivo-grupo-teste`
> Feature greenfield: nenhuma regra 🟢 extraída de código para vigiar ainda.

## Watch principal

| ID | Origem (arquivo, seção) | Regra esperada após mudança | Tipo de verificação | Sinal de violação |
|----|-------------------------|-----------------------------|---------------------|-------------------|

(vazio até uma extração `/reversa` confirmar as regras abaixo como 🟢)

## Observações

| ID | Origem | Regra implementada | Verificada por |
|----|--------|--------------------|----------------|
| W001 | `requirements.md#RN-01`, `RF-05` | Grupo sem captura ativa não grava nada; mensagem anterior à autorização é descartada | `test/unit/whatsapp/whatsapp-capture.test.ts`, `test/e2e/whatsapp-capture.test.ts` |
| W002 | `requirements.md#RN-02`, `RF-03` | Autorizar exige declaração de consentimento (10 a 500 caracteres), guardada com quem e quando | `test/unit/identity-sources/capture-authorization.test.ts`, `test/integration/live-capture-sources.test.ts` |
| W003 | `requirements.md#RN-04`, `RF-07` (D-09) | Mesma mensagem ao vivo × importada (mesmo texto normalizado, até 60 s) fica com um registro e duas proveniências, nos dois sentidos | `test/integration/live-capture-ingestion.test.ts`, `test/unit/ingestion/*.test.ts`, `test/e2e/whatsapp-capture.test.ts` |
| W004 | `requirements.md#RN-05` (D-06) | `--conversa` liga o grupo à fonte importada; sem ela, fonte nova com o nome do grupo; nunca casamento por nome | `test/integration/live-capture-sources.test.ts` |
| W005 | `requirements.md#RN-06`, `RF-08` | Revogar para a captura na próxima mensagem; o que já foi guardado continua nas respostas | `test/unit/identity-sources/capture-authorization.test.ts`, `test/e2e/whatsapp-capture.test.ts` |
| W006 | `requirements.md#RN-07`, `RF-09` | Mídia de grupo autorizado é contada por tipo e descartada sem download | `test/unit/whatsapp/whatsapp-capture.test.ts`, `test/unit/whatsapp/baileys-groups.test.ts` |
| W007 | `requirements.md#RN-08` (D-15) | Nenhum número escreve em grupos; no modo `dedicated`, mensagem direta ao número de captura é descartada | `test/unit/whatsapp/baileys-groups.test.ts`, `test/unit/whatsapp/simulated-provider.test.ts`, `test/e2e/whatsapp-capture.test.ts` |
| W008 | `requirements.md#RN-03`, `RF-01`, `RF-11` (D-01, D-02) | `PALANTIR_WHATSAPP_CAPTURE`: `off` igual à S2, `agent` responde e captura, `dedicated` com sessão própria; setup preserva o modo | `test/unit/platform/config.test.ts`, `test/unit/scripts/env-file.test.ts`, `test/unit/whatsapp/whatsapp-capture.test.ts`, `test/e2e/whatsapp-capture.test.ts` |
| W009 | `requirements.md#RN-10` (D-11) | Autor ao vivo: número E.164 (ou `lid:`) e nome de perfil; sem nome, número mascarado; sem número, "Participante" | `test/unit/whatsapp/whatsapp-capture.test.ts`, `test/unit/whatsapp/baileys-groups.test.ts` |
| W010 | `requirements.md#RF-04`, §6 (desempenho) | Mensagem do grupo autorizado responde em até 10 s com autor, conversa e data | `test/e2e/whatsapp-capture.test.ts` |
| W011 | `requirements.md#RF-10` (D-16) | Health com `capture`; métricas de capturadas, descartadas por motivo, mídia e reconciliadas; estado e alertas por papel | `test/unit/whatsapp/observability.test.ts`, `test/e2e/whatsapp-capture.test.ts`, `promtool check rules` |
| W012 | `requirements.md#RF-12` | O WhatsApp com captura passa a suíte de contrato, inclusive os testes de captura | `test/contract/whatsapp-capture.contract.test.ts` |
| W013 | `requirements.md#6` (privacidade) | Logs sem texto, telefone, nome de pessoa ou de grupo; diretório sem pessoas; comando sem ids de grupo | `test/e2e/whatsapp-capture.test.ts`, `test/integration/live-capture-sources.test.ts`, `test/unit/whatsapp/whatsapp-groups-cli.test.ts` |
| W014 | `roadmap.md#D-07` | O comando `whatsapp:grupos` só lê e grava no banco, sem abrir conexão com o WhatsApp | `test/integration/live-capture-sources.test.ts` (T012) |

## Histórico de re-extrações

(vazio)

## Arquivadas

(vazio)
