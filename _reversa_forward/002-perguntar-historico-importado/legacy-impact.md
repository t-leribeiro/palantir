# Legacy impact: Perguntar ao histórico importado (fatia S1)

> Identificador: `002-perguntar-historico-importado`
> Data: `2026-11-23`
> Feature greenfield sobre a 001 (sem legado extraído de código). Âncora: `prd.md` + specs SDD + adendo `addenda/001-walking-skeleton.md`.
> Política de edição no momento da execução: `allowLegacyEdits: true`, `allowedPaths: []` (projeto inteiro liberado).
> Execução: 14 de 14 ações.

## Arquivos afetados

| Arquivo afetado | Componente (spec) | Tipo | Severidade | Justificativa |
|-----------------|-------------------|------|------------|---------------|
| `contracts/channel/canonical-message.schema.json`, `src/contracts/channel/*` | channel-contract | delta-de-contrato-externo | HIGH | Contrato 1.1.0: `source.importKey` obrigatório em `export_import` (aditivo) |
| `src/channels/whatsapp-export/*` | whatsapp-export-importer | componente-novo | HIGH | Leitura segura de ZIP/TXT, parser Android/iOS pt-BR/en, fuso, chave e importador |
| `src/modules/ingestion/domain/message.ts`, `infrastructure/pg-message-store.ts` | ingestion | regra-alterada | HIGH | Deduplicação também por `(source_id, import_key)` |
| `src/modules/sources/application/ensure-import-source.ts`, `infrastructure/pg-import-source-repository.ts`, `index.ts` | identity-and-sources | regra-nova | MEDIUM | Importar autoriza a conversa; conta `whatsapp` pendente sem número |
| `src/main/import.ts`, `src/main/compose.ts`, `package.json` | whatsapp-export-importer | componente-novo | MEDIUM | Comando `npm run import`; `buildIngest` reutilizável |
| `test/**` (whatsapp-export, ingestion, identity-sources, integration, e2e) e `test/fixtures/whatsapp-export/*` | platform-foundation | componente-novo | LOW | TDD da fatia; amostras sintéticas |
| `README.md`, `CLAUDE.md`, `AGENTS.md`, `docs/plano-de-fatias.md`, `docs/adr/0004-*.md` | platform-foundation | componente-novo | LOW | Documentação, status da fatia e nota do contrato 1.1.0 |

Arquivos pré-existentes modificados: os da 001 listados acima (contrato, ingestão, sources, compose, testes e docs). Nenhum arquivo anterior ao pipeline foi alterado.

## Diff conceitual por componente

- **channel-contract:** 1.0.0 → 1.1.0, só aditivo. Mensagens 1.0.0 continuam válidas.
- **ingestion:** o `ON CONFLICT` passa a escolher o índice pela chave presente (id externo ou chave de importação).
- **identity-and-sources:** nova regra de opt-in por importação; a conta `whatsapp` nasce `pending` e por isso não identifica ninguém no agente até a S2.
- **whatsapp-export-importer:** recusa antes de gravar (segurança, formato, data ambígua); mídias só contadas.

## Preservadas

Feature greenfield: não há regras 🟢 extraídas de código para preservar. Os testes da 001 continuam verdes.

## Modificadas

Feature greenfield: nenhuma regra 🟢 alterada ou removida.
