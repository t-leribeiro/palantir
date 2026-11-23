# Legacy impact: Perguntar pelo WhatsApp ao número do agente (fatia S2)

> Identificador: `003-perguntar-pelo-whatsapp`
> Data: `2026-11-23`
> Feature greenfield sobre a 001 e a 002 (sem legado extraído de código). Âncora: `prd.md` + specs SDD + adendos `addenda/001-*`, `addenda/002-*` e `addenda/bug-*`.
> Política de edição no momento da execução: `allowLegacyEdits: true`, `allowedPaths: []` (projeto inteiro liberado).
> Execução: 17 de 17 ações.

## Arquivos afetados

| Arquivo afetado | Componente (spec) | Tipo | Severidade | Justificativa |
|-----------------|-------------------|------|------------|---------------|
| `contracts/channel/agent-reply.schema.json`, `src/contracts/channel/*`, `contracts/openapi.yaml` | channel-contract | delta-de-contrato-externo | HIGH | `AgentReply` 1.2.0 com `outcome: "help"` (aditivo); `AgentHandler` devolve `AgentReply \| null`; rota de teste responde `204` sem resposta; health com estados de sessão |
| `src/channels/whatsapp/**` | whatsapp-baileys-adapter | componente-novo | HIGH | Adaptador do número do agente: porta `WhatsAppProvider`, provedor real isolado, simulado, sessão AES-256-GCM, renderização, ritmo, recibos, métricas |
| `src/modules/agent/**` | conversational-agent | regra-alterada | HIGH | Ajuda para cumprimentos, aviso de "só texto", política `silent` para remetente desconhecido, recibos de perguntas |
| `src/modules/identity/**`, `src/shared/phone.ts`, `src/main/whatsapp-link.ts` | identity-and-sources | regra-nova | HIGH | Cadastro do número por comando (sem código; verificação na S5), E.164 com nono dígito, `already_linked` sem revelar o dono |
| `migrations/0005_agent_inbound_receipts.sql` | conversational-agent | delta-de-dados | MEDIUM | Tabela de recibos sem conteúdo, retenção de 7 dias |
| `src/main/whatsapp.ts`, `src/main/compose.ts`, `src/main/telemetry-bootstrap.ts`, `package.json` | platform-foundation | componente-novo | MEDIUM | Processo `dev:whatsapp`, composição `buildWhatsApp`, comando `whatsapp:link`, dependências `baileys@7.0.0-rc14` e `qrcode` |
| `src/platform/config.ts`, `src/platform/http/server.ts`, `.env.example`, `scripts/env-file.mjs`, `scripts/infra.mjs` | platform-foundation | regra-alterada | MEDIUM | Papel `whatsapp`, chave da sessão validada sem expor o valor, setup preservando as variáveis do WhatsApp, health com estados de sessão |
| `.dependency-cruiser.cjs`, `test/architecture/**` | platform-foundation | regra-nova | MEDIUM | Regra `whatsapp-lib-isolated` com fixtures |
| `src/channels/shared/split.ts`, `src/channels/fake/*` | channel-contract | regra-alterada | LOW | Divisão em partes compartilhada; fake sem enviar quando a resposta é `null` |
| `infra/local/config/grafana/dashboards/whatsapp.json`, `infra/local/config/prometheus/*`, `infra/modules/observability/main.tf` | platform-foundation | componente-novo | LOW | Painel WhatsApp e alertas `WhatsAppLoggedOut` e `WhatsAppReconnectingTooLong` |
| `test/**` (whatsapp, agent, identity-sources, shared, platform, scripts, contract, integration, e2e) | platform-foundation | componente-novo | LOW | TDD da fatia, suíte de contrato para o WhatsApp simulado |
| `docs/adr/0009-*.md`, `docs/adr/0004-*.md`, `docs/adr/README.md`, `README.md`, `CLAUDE.md`, `AGENTS.md`, `docs/plano-de-fatias.md` | platform-foundation | componente-novo | LOW | ADR do adaptador, nota do contrato 1.2.0, comandos e status |

Arquivos pré-existentes modificados: os das features 001 e 002 listados acima. Nenhum arquivo anterior ao pipeline foi alterado.

## Diff conceitual por componente

- **channel-contract:** `AgentReply` 1.1.0 → 1.2.0, só aditivo. A porta ganha a semântica "sem resposta" (`null`). A suíte de contrato passa a respeitar as capacidades: canais que não capturam não rodam os testes de captura.
- **conversational-agent:** depois de resolver a identidade, o agente responde ajuda para cumprimentos e o aviso de "só texto" para mídia, sem busca. Com a política `silent`, remetente sem conta ativa não recebe nada.
- **identity-and-sources:** a conta `whatsapp` provisória da S1 (`unlinked:<user_id>`, `pending`) vira a conta real (número, `active`) pelo comando; as conversas importadas continuam na mesma conta e `ensurePendingAccount` passa a encontrá-la.
- **whatsapp-baileys-adapter:** só a parte de interface do agente: sem captura, sem mídia. Grupos, transmissões, status e canais são descartados no provedor.
- **platform-foundation:** novo papel de processo, chave de sessão no `.env`, observabilidade do canal.

## Preservadas

Feature greenfield: não há regras 🟢 extraídas de código para preservar. Os testes da 001 e da 002 continuam verdes; o canal de teste mantém a orientação de vínculo para remetentes desconhecidos (política `reply`).

## Modificadas

Feature greenfield: nenhuma regra 🟢 alterada ou removida. Regra 🟡 da 002 que evolui: W007 (conta `whatsapp` `pending` não identifica ninguém) continua valendo até o cadastro; depois do `whatsapp:link` a conta passa a identificar o dono.
