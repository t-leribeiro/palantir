# Regression watch: Ver a mensagem original com contexto (fatia S7)

> Identificador: `008-mostrar-original-com-contexto`
> Feature greenfield: nenhuma regra 🟢 extraída de código para vigiar ainda.

## Watch principal

| ID | Origem (arquivo, seção) | Regra esperada após mudança | Tipo de verificação | Sinal de violação |
|----|-------------------------|-----------------------------|---------------------|-------------------|

(vazio até uma extração `/reversa` confirmar as regras abaixo como 🟢)

## Observações

| ID | Origem | Regra implementada | Verificada por |
|----|--------|--------------------|----------------|
| W001 | `requirements.md#RN-01`, `RF-01` (D-02, D-03) | Toda resposta com citações grava só os ids, o tipo e a faixa do trecho, por dono e canal, por 2 h; "não encontrei" não troca a lista | `test/unit/agent/ask-question.test.ts`, `test/integration/conversation-state.test.ts` |
| W002 | `requirements.md#RN-02`, `RF-02` (D-01) | "mostra a N", "ver N" e "original N" são reconhecidos por palavras fixas, sem LLM; frases com "mostra" continuam perguntas | `test/unit/agent/show-source-command.test.ts`, `test/e2e/show-source.test.ts` |
| W003 | `requirements.md#RN-03` (D-05) | A mensagem é lida pelo id dentro do espaço do dono; conversa em exclusão não é mostrada | `test/integration/source-context.test.ts`, `test/e2e/show-source.test.ts` |
| W004 | `requirements.md#RN-04`, `RF-03` (D-06) | A citada vem inteira (até 12.000 caracteres), com autor, conversa, data e hora | `test/unit/agent/compose-original.test.ts`, `test/e2e/show-source.test.ts` |
| W005 | `requirements.md#RN-05`, `RF-04` (D-04) | Até 3 vizinhas de cada lado, só da mesma conversa e do mesmo espaço; no mesmo minuto, a ordem de gravação | `test/integration/source-context.test.ts` |
| W006 | `requirements.md#RN-06`, `RF-05` (D-06, D-11) | Áudio mostra a transcrição por segmentos com o trecho citado marcado, em janela de 6.000 caracteres, ou o estado da transcrição | `test/unit/agent/compose-original.test.ts` |
| W007 | `requirements.md#RN-06`, `RF-06` (D-07 a D-10) | O arquivo do áudio vai por referência no `AgentReply` (contrato 1.4.0) e só para a conta ativa dona do espaço, com o SHA-256 conferido; nunca para grupo; falha entrega o texto de falha | `test/integration/outbound-media.test.ts`, `test/contract/channel-contract-suite.ts`, `test/e2e/show-source.test.ts` |
| W008 | `requirements.md#RN-07`, `RF-07` | Sem citações recentes ou com número fora da lista, o agente explica e não busca nada | `test/unit/agent/show-source.test.ts`, `test/e2e/show-source.test.ts` |
| W009 | `requirements.md#RN-08`, `RF-09` (D-12) | Métricas e logs sem texto, nomes ou telefones: `agent_show_source_total` e `channel_media_sent_total` só com resultado e tipo | `test/unit/agent/otel-show-source-observer.test.ts`, `test/unit/whatsapp/observability.test.ts`, `test/e2e/show-source.test.ts` |
| W010 | `requirements.md#RF-08` (D-13) | A ajuda ensina "mostra a 2" e continua com até 600 caracteres | `test/unit/agent/ask-question.test.ts`, `test/unit/agent/help-and-policy.test.ts` |

## Histórico de re-extrações

(vazio)

## Arquivadas

(vazio)
