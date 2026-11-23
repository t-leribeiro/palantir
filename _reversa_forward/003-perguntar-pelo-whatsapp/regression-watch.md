# Regression watch: Perguntar pelo WhatsApp ao número do agente (fatia S2)

> Identificador: `003-perguntar-pelo-whatsapp`
> Feature greenfield: nenhuma regra 🟢 extraída de código para vigiar ainda.

## Watch principal

| ID | Origem (arquivo, seção) | Regra esperada após mudança | Tipo de verificação | Sinal de violação |
|----|-------------------------|-----------------------------|---------------------|-------------------|

(vazio até uma extração `/reversa` confirmar as regras abaixo como 🟢)

## Observações

| ID | Origem | Regra implementada | Verificada por |
|----|--------|--------------------|----------------|
| W001 | `_reversa_forward/003-perguntar-pelo-whatsapp/requirements.md#RF-04` | Pergunta de número cadastrado recebe, na mesma conversa, resposta com autor, conversa e data | `test/e2e/whatsapp-agent.test.ts` |
| W002 | `requirements.md#RF-05` / RN-02 | Remetente desconhecido ou não resolvido não dispara busca nem recebe mensagem | `test/unit/agent/help-and-policy.test.ts`, `test/unit/whatsapp/whatsapp-channel.test.ts`, `test/e2e/whatsapp-agent.test.ts` |
| W003 | `requirements.md#RF-10` | Pergunta reentregue (reconexão ou reinício) gera uma resposta só; mensagem com mais de 10 min é ignorada | `test/integration/whatsapp-s2.test.ts`, `test/unit/whatsapp/whatsapp-channel.test.ts` |
| W004 | `requirements.md#RF-07` / RN-04 | Perguntas e respostas não entram na base pesquisável; recibos sem texto nem remetente | `test/integration/whatsapp-s2.test.ts`, `test/e2e/whatsapp-agent.test.ts` |
| W005 | `requirements.md#RF-03` / RN-03, RN-07 | Cadastro ativa a conta provisória mantendo as conversas importadas; número de outro usuário recusado sem revelar quem | `test/unit/identity-sources/link-whatsapp-number.test.ts`, `test/integration/whatsapp-s2.test.ts` |
| W006 | `investigation.md#4` (D-07) | Celular brasileiro sem o nono dígito é normalizado para a forma com o 9, no cadastro e no remetente | `test/unit/shared/phone.test.ts`, `test/unit/whatsapp/mapping.test.ts` |
| W007 | `requirements.md#RF-08`, `RF-09` | Partes ≤ 4.000 caracteres numeradas, sem cortar citação; ≥ 1 s entre partes por destinatário | `test/unit/whatsapp/render.test.ts`, `test/unit/whatsapp/pacer.test.ts` |
| W008 | `requirements.md#RF-02` (D-05) | Sessão só em arquivo AES-256-GCM fora do repositório; chave errada pede novo pareamento; setup preserva a chave | `test/unit/whatsapp/session-store.test.ts`, `test/unit/whatsapp/baileys-auth-state.test.ts`, `test/unit/scripts/env-file.test.ts` |
| W009 | `roadmap.md#D-20` | Só `baileys-provider.ts` importa a biblioteca não oficial | `npm run arch`, `test/architecture/rules.test.ts` |
| W010 | `requirements.md#RF-13` / D-19 | O adaptador WhatsApp passa a suíte de contrato do canal com o provedor simulado | `test/contract/whatsapp-channel.contract.test.ts` |
| W011 | `requirements.md#RF-14` | "oi", "ajuda" e similares recebem a ajuda curta (≤ 600 caracteres, ≥ 2 exemplos), sem busca; mídia recebe o aviso de "só texto" | `test/unit/agent/help-and-policy.test.ts`, `test/e2e/whatsapp-agent.test.ts` |
| W012 | `requirements.md#6` (privacidade) | Logs sem número de telefone nem texto das perguntas; comando mostra o número mascarado | `test/e2e/whatsapp-agent.test.ts`, `test/unit/shared/phone.test.ts` |
| W013 | `requirements.md#RF-11`, `RF-12` | Health mostra o estado da sessão (503 fora de `connected`); canal desligado não conecta | `test/e2e/whatsapp-agent.test.ts` |

## Histórico de re-extrações

(vazio)

## Arquivadas

(vazio)
