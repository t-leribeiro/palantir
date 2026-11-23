# Legacy impact: Captura ao vivo de um grupo de teste autorizado (fatia S3)

> Identificador: `004-captura-ao-vivo-grupo-teste`
> Data: `2026-11-23`
> Feature greenfield sobre a 001, a 002 e a 003 (sem legado extraído de código). Âncora: `prd.md` + specs SDD + adendos `addenda/001-*`, `addenda/002-*`, `addenda/003-*` e `addenda/bug-*`.
> Política de edição no momento da execução: `allowLegacyEdits: true`, `allowedPaths: []` (projeto inteiro liberado).
> Execução: 16 de 16 ações.

## Arquivos afetados

| Arquivo afetado | Componente (spec) | Tipo | Severidade | Justificativa |
|-----------------|-------------------|------|------------|---------------|
| `migrations/0006_live_capture.sql` | identity-and-sources, ingestion | delta-de-dados | MEDIUM | Tabelas `source_captures` (autorização auditada com consentimento) e `whatsapp_groups` (diretório sem pessoas); índice `messages (source_id, sent_at)` |
| `src/modules/ingestion/**` | ingestion | regra-alterada | HIGH | Reconciliação ao vivo × importada nos dois sentidos (RN-04: mesmo texto normalizado e até 60 s, autor só desempata); preenche a chave nula e acrescenta proveniência, sem novo job |
| `src/contracts/channel/knowledge-channel.ts`, `contracts/openapi.yaml`, `src/channels/fake/http-routes.ts` | channel-contract | delta-de-contrato-externo | MEDIUM | `IngestOutcome.reconciled` (aditivo, contrato continua 1.2.0); rota de teste responde `reconciled`; health aceita `off` |
| `src/modules/sources/**` | identity-and-sources | regra-nova | HIGH | Autorizar (consentimento de 10 a 500 caracteres, `--conversa` liga à importação), revogar, rotear grupo → fonte, diretório de grupos |
| `src/channels/whatsapp/**` | whatsapp-baileys-adapter | regra-alterada | HIGH | Papéis `answer`/`capture`; grupos só com captura ligada; autor por número, `participantAlt`, `lidMapping` ou LID; mídia contada e descartada; nada anterior à autorização; envio a grupo bloqueado |
| `src/main/compose.ts`, `src/main/whatsapp.ts`, `src/main/whatsapp-groups.ts`, `src/main/import.ts`, `package.json` | platform-foundation, whatsapp-export-importer | componente-novo | MEDIUM | Modos `off`/`agent`/`dedicated`, ingestão no processo do WhatsApp, segundo provedor com `capture-session.enc`, comando `whatsapp:grupos`, linha "Reconciliadas" no relatório |
| `src/platform/config.ts`, `src/platform/http/server.ts`, `.env.example`, `scripts/env-file.mjs` | platform-foundation | regra-alterada | LOW | `PALANTIR_WHATSAPP_CAPTURE` validada e preservada pelo setup; `off` conta como saudável no health |
| `src/channels/whatsapp-export/importer.ts` | whatsapp-export-importer | regra-alterada | LOW | Conta reconciliadas no relatório |
| `infra/local/config/grafana/dashboards/whatsapp.json`, `infra/local/config/prometheus/rules.yml` | platform-foundation | regra-alterada | LOW | Painéis de captura e reconciliação; estado e alertas por papel da sessão |
| `test/**` (unit, integration, contract, e2e) | platform-foundation | componente-novo | LOW | TDD da fatia; suíte de contrato com captura para o WhatsApp simulado; E2E da S3 |
| `docs/adr/0009-*.md`, `docs/adr/0004-*.md`, `README.md`, `CLAUDE.md`, `AGENTS.md`, `docs/plano-de-fatias.md` | platform-foundation | componente-novo | LOW | Modo `agent` provisório e risco aceito, `IngestOutcome.reconciled`, comandos e status |

Arquivos pré-existentes modificados: os das features 001, 002 e 003 listados acima. Nenhum arquivo anterior ao pipeline foi alterado.

## Diff conceitual por componente

- **ingestion:** antes, a mesma mensagem vinda pela captura e pela importação viraria dois registros, porque uma tem o id do WhatsApp e a outra só a chave da importação. Agora, sem a própria chave na fonte, a ingestão procura a mensagem do outro caminho (mesma fonte, mesmo texto normalizado, até 60 s). Na reconciliação, grava a chave que faltava e a proveniência nova, e as próximas reentregas ou reimportações caem como duplicata pelo índice existente. O autor deixou de ser critério, porque a importação e a captura identificam a pessoa de jeitos diferentes.
- **identity-and-sources:** a autorização de captura é um registro próprio, auditado e com histórico, separado do status da fonte. Revogar a captura não esconde o histórico importado. O grupo cai numa fonte nova ou, com `--conversa`, na fonte `export:<nome>` da importação.
- **whatsapp-baileys-adapter:** o mesmo adaptador responde e captura, conforme o papel. Sem captura, o comportamento é idêntico ao da S2. Com captura, só texto de grupo autorizado e posterior à autorização vira `CanonicalMessage` `live`, e nenhum número escreve em grupos.
- **channel-contract:** a porta ganhou `reconciled`, e a suíte de contrato roda os testes de captura no WhatsApp.
- **platform-foundation:** o processo do WhatsApp passa a ingerir (pg-boss só para publicar), o health mostra a captura e o painel e os alertas distinguem agente de captura.

## Preservadas

Feature greenfield: não há regras 🟢 extraídas de código para preservar. Os testes da 001, 002 e 003 continuam verdes. O modo padrão (`off`) mantém a S2 idêntica; o único ajuste foi o health, que agora mostra `capture: "off"`.

## Modificadas

Feature greenfield: nenhuma regra 🟢 alterada ou removida. Regras 🟡 que evoluem:
- **RN-01 da S2** ("o número do agente não captura"): suspensa no modo `agent`, por decisão do esclarecimento de 2026-11-23, até existir o segundo chip.
- **RF-04 da spec `ingestion`:** o autor saiu do critério de reconciliação (RN-04 desta feature).
