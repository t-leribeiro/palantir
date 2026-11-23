# Adendo: Perguntar pelo WhatsApp ao número do agente (fatia S2)

> Feature: `003-perguntar-pelo-whatsapp`
> Data: `2026-11-23`
> Cenário: `greenfield`

## Vigência

Vigente desde 2026-11-23.

## Resumo da entrega

O usuário manda uma pergunta, pelo WhatsApp do celular pessoal, ao número dedicado do agente (o chip secundário) e recebe na mesma conversa a resposta com autor, conversa e data do histórico importado. O número pessoal é cadastrado por comando (`npm run whatsapp:link`) e o canal sobe com `npm run dev:whatsapp`, pareado por QR Code uma única vez. Cumprimentos recebem uma ajuda curta, mídia recebe o aviso de "só texto" e remetente desconhecido não recebe nada. Só interface do agente: sem captura de grupos ao vivo (S3) e sem mídia (S4). 17 de 17 ações concluídas, mais 2 correções registradas no `progress.jsonl` (T010, criptografia da sessão com tag de tamanho fixo; T013, reconexão logo após o pareamento, achada na demonstração com o chip real). Entregue no PR #5 e demonstrada com o chip real.

## Impacto por artefato da extração

As specs continuam 🟡 PLANEJADO. Lê-las junto com este adendo e com `addenda/001-walking-skeleton.md` e `addenda/002-perguntar-historico-importado.md`.

| Artefato | Seção | Tipo de impacto | Delta |
|----------|-------|-----------------|-------|
| `_reversa_sdd/sdd/whatsapp-baileys-adapter.md` | 6. Requisitos Funcionais | componente-novo | Implementados RF-01 (QR só no terminal), RF-02 (AES-256-GCM em arquivo fora do banco, em `~/.palantir/whatsapp/`), RF-07 (backoff de 1 a 60 s; reentrega deduplicada por recibo), RF-08, RF-09, RF-10 e RF-11 (inclui `pairing`). RF-03 a RF-06 (listar conversas, captura ao vivo, descarte de não autorizadas e mídia) pendentes para a S3 e a S4: grupos, transmissões e status são descartados no provedor. |
| `_reversa_sdd/sdd/whatsapp-baileys-adapter.md` | 10. Integrações e Dependências | componente-novo | Biblioteca `baileys@7.0.0-rc14`, importada só em `src/channels/whatsapp/provider/baileys-provider.ts` (regra `whatsapp-lib-isolated`); testes usam o provedor simulado. Decisão em `docs/adr/0009-adaptador-whatsapp-nao-oficial.md`. |
| `_reversa_sdd/sdd/channel-contract.md` | 6. Requisitos Funcionais | delta-de-contrato-externo | Contrato 1.2.0: `AgentReply.outcome` ganha `help` (aditivo); o `AgentHandler` pode devolver `null` (o canal não envia nada); a suíte de contrato (RF-07) respeita as capacidades e roda para o adaptador de teste e para o WhatsApp simulado. |
| `_reversa_sdd/sdd/conversational-agent.md` | 6. Requisitos Funcionais | regra-alterada | RF-01 ganha a política de remetente desconhecido: `silent` no WhatsApp (nada enviado, só métrica), `reply` no canal de teste. RF-02 parcial: só a intenção `help`, por palavras fixas, sem busca; mídia recebe aviso de "só texto". |
| `_reversa_sdd/sdd/conversational-agent.md` | 9. Modelo de Dados | delta-de-dados | Tabela `agent_inbound_receipts` (`provider`, `external_message_id`, `received_at`), sem texto nem remetente, retenção de 7 dias: impede responder duas vezes a uma pergunta reentregue. Perguntas e respostas ao agente não entram na base pesquisável. |
| `_reversa_sdd/sdd/identity-and-sources.md` | 6. Requisitos Funcionais | regra-nova | RF-02 e RF-09 em uso real: o comando `whatsapp:link` converte a conta provisória da S1 (`unlinked:<user_id>`, `pending`) na conta ativa com o número em E.164, mantendo as conversas importadas; celular brasileiro sem o nono dígito é normalizado. RF-03 (verificação por código) adiado para a S5: o cadastro é ato do operador. Número de outro usuário é recusado sem revelar o dono. |
| `_reversa_sdd/sdd/platform-foundation.md` | 6. Requisitos Funcionais | componente-novo | Novo papel de processo `whatsapp` com health em `:8081` (estados `pairing`, `connected`, `reconnecting`, `logged_out`), chave da sessão no `.env` gerada e preservada pelo `npm run setup`, liga/desliga por `PALANTIR_WHATSAPP_ENABLED`, painel Grafana "WhatsApp" e alertas `WhatsAppLoggedOut` e `WhatsAppReconnectingTooLong`. |
| `_reversa_sdd/prd.md` | 4. Escopo (in) | componente-novo | "Agente conversacional no WhatsApp" entregue para perguntas de texto sobre histórico importado, num número dedicado. A captura contínua via Baileys continua pendente (S3, com um segundo número). |

Impactos registrados: 8 linhas (4 `componente-novo`, 1 `delta-de-contrato-externo`, 1 `regra-alterada`, 1 `delta-de-dados`, 1 `regra-nova`).

## Regras sob vigilância

W001 a W013, em `_reversa_forward/003-perguntar-pelo-whatsapp/regression-watch.md` (seção Observações).

## Fontes

- `_reversa_forward/003-perguntar-pelo-whatsapp/legacy-impact.md`
- `_reversa_forward/003-perguntar-pelo-whatsapp/regression-watch.md`
- `_reversa_forward/003-perguntar-pelo-whatsapp/requirements.md`
- `_reversa_forward/003-perguntar-pelo-whatsapp/progress.jsonl`
- `_reversa_forward/003-perguntar-pelo-whatsapp/actions.md` (Notas de execução)
- `docs/adr/0009-adaptador-whatsapp-nao-oficial.md`
