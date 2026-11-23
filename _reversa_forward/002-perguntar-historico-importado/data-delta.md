# Data delta: Perguntar ao histórico importado (fatia S1)

> Identificador: `002-perguntar-historico-importado`
> Base: esquema criado pela feature 001 (migrações 0001–0004)

## Migrações

Nenhuma. A coluna `messages.import_key` e o índice único parcial `messages_source_import_key (source_id, import_key) WHERE import_key IS NOT NULL` já existem.

## Novos dados gerados pela importação

| Tabela | Registro | Regra |
|--------|----------|-------|
| `channel_accounts` | `provider = 'whatsapp'`, `external_account_id = 'unlinked:<user_id>'`, `status = 'pending'`, `verified_at = null` | Um por dono; criado na primeira importação. A S2 troca `external_account_id` pelo número e passa a `active` após verificar |
| `sources` | `external_conversation_id = 'export:<slug do nome>'`, `title = <nome informado>`, `kind = 'group'`, `status = 'authorized'` | Uma por conversa importada (RN-01); reutilizada nas reimportações |
| `participants` | `external_id = <autor normalizado>`, `display_name = <autor como aparece no arquivo>` | Como na 001 |
| `messages` | `import_key = <SHA-256 de D-07>`, `external_message_id = null` | Deduplicação pela chave (RN-02) |
| `message_provenance` | `capture_method = 'export_import'`, `adapter = 'whatsapp-export'` | Como na 001 |
