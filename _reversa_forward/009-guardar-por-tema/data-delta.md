# Data delta: Guardar um conteúdo com tema (fatia S8)

> Identificador: `009-guardar-por-tema`
> Base: `_reversa_sdd/sdd/knowledge-indexing.md#9. Modelo de Dados`, migrações `0002`, `0003`, `0007`, `0008` e `0010`

## 1. Diff conceitual sobre o modelo da spec

| Entidade da spec | O que entra | Diferença em relação à spec |
|------------------|-------------|-----------------------------|
| `Theme { id, space_id, name, normalized }` | `themes` | Mais `created_at`. `name` até 60 caracteres. `normalized` único por espaço. "sem tema" é um tema comum, criado sob demanda |
| `KnowledgeItem { id, space_id, kind, theme_id?, title?, note?, created_by, created_at }` | `knowledge_items` | Na S8, só `kind = 'saved'`, `created_by = 'user'`, `theme_id` obrigatório para `saved` (por `CHECK`). `title` e `note` ficam sem uso, porque a nota opcional não entra nesta fatia |
| `EvidenceReference { knowledge_item_id, message_id, chunk_id? }` | `evidence_references` | Chave `(knowledge_item_id, message_id)`. `chunk_id` sem uso na S8 |
| `Source.kind` | `sources.kind` ganha `'saved'` | Uma fonte `saved` por espaço (índice único parcial) |
| `audit_events.action` | duas ações novas | `knowledge.item_saved` e `knowledge.item_forgotten` |

O que espera pedido (até 10 min) **não** tem tabela: fica na memória do processo (D-05).

## 2. Migração `0011_saved_items.sql`

```sql
ALTER TABLE sources DROP CONSTRAINT sources_kind_check;
ALTER TABLE sources ADD CONSTRAINT sources_kind_check CHECK (kind IN ('group', 'direct', 'saved'));
CREATE UNIQUE INDEX sources_one_saved_per_space ON sources (space_id) WHERE kind = 'saved';

CREATE TABLE themes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES knowledge_spaces (id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  normalized text NOT NULL CHECK (char_length(normalized) BETWEEN 1 AND 60),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (space_id, normalized)
);

CREATE TABLE knowledge_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES knowledge_spaces (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('saved', 'summary')),
  theme_id uuid REFERENCES themes (id) ON DELETE CASCADE,
  title text,
  note text CHECK (note IS NULL OR char_length(note) <= 2000),
  created_by text NOT NULL CHECK (created_by IN ('user', 'agent')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (kind <> 'saved' OR theme_id IS NOT NULL)
);
CREATE INDEX knowledge_items_theme ON knowledge_items (space_id, theme_id, created_at DESC);

CREATE TABLE evidence_references (
  knowledge_item_id uuid NOT NULL REFERENCES knowledge_items (id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES messages (id) ON DELETE CASCADE,
  chunk_id uuid REFERENCES message_chunks (id) ON DELETE SET NULL,
  PRIMARY KEY (knowledge_item_id, message_id)
);
CREATE INDEX evidence_references_message ON evidence_references (message_id);

-- RN-05 e RN-10: item sem evidência e tema sem item não sobrevivem (exclusão por "esquece a N" ou da fonte).
CREATE FUNCTION palantir_drop_orphan_items() RETURNS trigger AS $$
BEGIN
  DELETE FROM knowledge_items k WHERE k.id = OLD.knowledge_item_id
    AND NOT EXISTS (SELECT 1 FROM evidence_references e WHERE e.knowledge_item_id = k.id);
  RETURN NULL;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER evidence_references_orphans AFTER DELETE ON evidence_references
  FOR EACH ROW EXECUTE FUNCTION palantir_drop_orphan_items();

CREATE FUNCTION palantir_drop_empty_themes() RETURNS trigger AS $$
BEGIN
  DELETE FROM themes t WHERE t.id = OLD.theme_id
    AND NOT EXISTS (SELECT 1 FROM knowledge_items k WHERE k.theme_id = t.id);
  RETURN NULL;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER knowledge_items_empty_themes AFTER DELETE ON knowledge_items
  FOR EACH ROW EXECUTE FUNCTION palantir_drop_empty_themes();

ALTER TABLE audit_events DROP CONSTRAINT audit_events_action_check;
ALTER TABLE audit_events ADD CONSTRAINT audit_events_action_check CHECK (action IN (
  'account.link_requested', 'account.verified', 'account.verification_locked',
  'capture.authorized', 'capture.revoked',
  'source.deletion_requested', 'source.deleted',
  'knowledge.item_saved', 'knowledge.item_forgotten'));

-- Down Migration
-- (inversa, na ordem contrária; o CHECK de sources volta a ('group','direct') e falha se existir fonte 'saved':
--  apague os Guardados antes de descer)
```

Os nomes das restrições (`sources_kind_check`, `audit_events_action_check`) são conferidos no banco antes de escrever a migração. Se forem outros, a migração usa os reais.

## 3. Mensagens guardadas

Não há coluna nova em `messages`. A mensagem guardada é uma mensagem comum da fonte Guardados:

| Campo | Valor |
|-------|-------|
| `source_id` | A fonte `saved` do espaço (`external_conversation_id = 'palantir:guardados'`, título "Guardados") |
| participante | O dono, `external_id` igual à conta do canal e `display_name` "Você" |
| `external_message_id` | O id da mensagem no canal: a encaminhada ou, para "guarda em X: texto", a do próprio pedido |
| `sent_at` | O momento da mensagem no canal, ou seja, quando o dono encaminhou ou escreveu |
| `kind` | `text`, `link` ou `audio`; foto, vídeo e documento entram como `text` com a legenda e sem anexo |
| `is_forwarded` | `true` para encaminhada |
| proveniência | `forwarded_to_agent` |
| anexo (áudio) | Preparado pelo `media.prepare`: cifrado no SeaweedFS com a chave `space/<fonte Guardados>/<sha256>` e `media.process` pelo outbox |

A ingestão já trata tudo isso. A indexação (`knowledge.index`) e a transcrição seguem iguais.

## 4. Leituras novas

- **Listagem do tema:** `knowledge_items` do espaço e do tema normalizado, junto com `evidence_references`, `messages` (`sent_at`, `kind`), o primeiro trecho (`message_chunks.idx = 0`) e o anexo (`duration_seconds`), ordenados por `created_at DESC`, limite 9, e a contagem total.
- **Temas:** `themes` do espaço, com a contagem de itens, ordenados pelo item mais recente, limite 20.
- **Duplicata no tema:** itens do tema cuja mensagem tem o mesmo `normalizeForMatch(text)` ou o mesmo `sha256` do anexo.
- **Título da citação:** na busca e no contexto, `CASE WHEN s.kind = 'saved' THEN 'Guardados · ' || t.name ELSE s.title END`, pelo item ligado à mensagem (um por mensagem, D-10).

## 5. Exclusão

| Caminho | O que acontece |
|---------|----------------|
| "esquece a N" | `DELETE FROM messages WHERE id = $1 AND source_id = <Guardados do espaço>`. A cascata leva `message_chunks`, `chunk_embeddings`, `attachments`, `transcripts`, `message_provenance` e `evidence_references`. Os gatilhos levam o item e, se ficar vazio, o tema. Se a chave do anexo não tiver outra referência, `media.purge_object` vai pelo outbox |
| "apagar Guardados" (S5) | Exclusão em duas etapas da S5: a purga por prefixo `<space>/<fonte>/` e a cascata pela fonte. Os gatilhos limpam itens e temas |
| Apagar o espaço | `ON DELETE CASCADE` de `themes` e `knowledge_items` |

## 6. Testes de esquema

- Sobe e desce a `0011`, e o teste de esquema da `0008` passa a desfazer 4 migrações.
- Item `saved` sem tema é recusado.
- Apagar a mensagem apaga o item e o tema vazio, mas não um tema que ainda tem itens.
- Segunda fonte `saved` no mesmo espaço é recusada.
