# Regression watch: Guardar um conteúdo com tema e recuperar pelo tema (fatia S8)

> Identificador: `009-guardar-por-tema`
> Feature greenfield: nenhuma regra 🟢 extraída de código para vigiar ainda.

## Watch principal

| ID | Origem (arquivo, seção) | Regra esperada após mudança | Tipo de verificação | Sinal de violação |
|----|-------------------------|-----------------------------|---------------------|-------------------|

(vazio até uma extração `/reversa` confirmar as regras abaixo como 🟢)

## Observações

| ID | Origem | Regra implementada | Verificada por |
|----|--------|--------------------|----------------|
| W001 | `requirements.md#RN-01`, `RF-02`, `RF-13` (D-06, D-07) | "guarda em X", "guarda isso em X", "guardar em X" e "guarda em X: texto" por palavras fixas; a citada tem prioridade; sem citação, o que espera, até 20; "como guardar senhas?" continua pergunta | `test/unit/agent/save-command.test.ts`, `test/unit/agent/save-content.test.ts`, `test/e2e/save-by-theme.test.ts` |
| W002 | `requirements.md#RN-02`, `RF-08` (D-05) | O encaminhado e a mídia nunca são pergunta: um aviso por leva, espera só na memória e descarte sem rastro em 10 min | `test/unit/agent/memory-pending-forwards.test.ts`, `test/unit/agent/saved-routing.test.ts`, `test/e2e/save-by-theme.test.ts` |
| W003 | `requirements.md#RN-03`, `RF-05` (D-09) | Tema de até 60 caracteres, normalizado e reaproveitado, com o nome da primeira vez nas respostas | `test/unit/knowledge-retrieval/saved-items.test.ts`, `test/integration/saved-items.test.ts`, `test/e2e/save-by-theme.test.ts` |
| W004 | `requirements.md#RN-04`, `RF-06` (D-14) | "guarda isso" pede o tema; um comando no meio não vira tema; sem resposta em 10 min, vai para "sem tema" e o aviso vem uma vez | `test/unit/agent/memory-pending-forwards.test.ts`, `test/unit/agent/save-content.test.ts`, `test/unit/agent/saved-routing.test.ts` |
| W005 | `requirements.md#RN-05`, `RF-03` (D-08) | Todo item aponta para a mensagem guardada na fonte Guardados do espaço (uma por espaço); item sem evidência e tema vazio são apagados pelos gatilhos | `test/integration/saved-items-schema.test.ts`, `test/integration/saved-source.test.ts`, `test/integration/saved-items.test.ts` |
| W006 | `requirements.md#RN-06` (D-03) | O autor do guardado é sempre o dono ("Você"), com a data em que encaminhou | `test/unit/agent/saved-replies.test.ts`, `test/e2e/save-by-theme.test.ts` |
| W007 | `requirements.md#RN-07`, `RF-04` (D-10) | O mesmo conteúdo no mesmo tema não duplica (texto normalizado ou SHA-256); em outro tema, vira outro item | `test/integration/saved-items.test.ts`, `test/e2e/save-by-theme.test.ts` |
| W008 | `requirements.md#RN-08`, `RN-09`, `RF-07` (D-11, D-12) | O guardado entra nas respostas normais como "Guardados · tema"; a listagem traz até 9 itens com o total e vale para o "mostra a N", que abre o item sem conversa em volta | `test/integration/saved-items.test.ts`, `test/unit/agent/compose-original.test.ts`, `test/e2e/save-by-theme.test.ts` |
| W009 | `requirements.md#RN-10`, `RF-09` (D-13, D-15) | "esquece a N" só para guardado, com "confirmo"; o arquivo sem referência sai por `media.purge_object`; Guardados aparece por último na lista da S5 e é apagado pela exclusão dela | `test/unit/agent/saved-routing.test.ts`, `test/unit/media/purge-object.test.ts`, `test/integration/saved-source.test.ts`, `test/e2e/save-by-theme.test.ts` |
| W010 | `requirements.md#RN-11`, `RF-14`, `RF-15` | Texto e link inteiros; áudio guardado cifrado e transcrito pela S4; de foto, vídeo e documento só a legenda; sem armazenamento de mídia, o áudio responde que não está ligado | `test/unit/agent/save-content.test.ts`, `test/e2e/save-by-theme.test.ts` |
| W011 | `requirements.md#RF-01`, `RF-12` (D-01, D-02, D-16) | A mensagem direta traz `isForwarded`, `quotedExternalMessageId`, a legenda e o áudio com `fetchRef`, nos dois canais, sem mudar a versão do contrato | `test/contract/channel-contract-suite.ts`, `test/unit/whatsapp/mapping.test.ts`, `test/unit/whatsapp/baileys-media.test.ts`, `test/unit/http/fake-routes.test.ts` |
| W012 | `requirements.md#RN-12`, `RF-11` (D-17, D-18) | Logs, métricas, traces e auditoria sem conteúdo, tema nem telefone; métricas só com resultado e tipo | `test/unit/agent/otel-save-observer.test.ts`, `test/e2e/save-by-theme.test.ts` |
| W013 | `requirements.md#RF-10` (D-19) | A ajuda ensina "guarda em" e "guardados", sem "só entendo texto", com até 600 caracteres | `test/unit/agent/help-and-policy.test.ts`, `test/e2e/save-by-theme.test.ts` |

## Histórico de re-extrações

(vazio)

## Arquivadas

(vazio)
