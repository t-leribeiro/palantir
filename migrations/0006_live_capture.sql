-- Up Migration
-- Captura ao vivo de grupos (feature 004, D-04 e D-07).
-- Autorização de captura com consentimento e histórico: revogar marca revoked_at, reautorizar cria linha nova.
-- É separada de sources.status para que revogar a captura não desautorize o histórico importado (RN-06).
CREATE TABLE source_captures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES sources (id) ON DELETE CASCADE,
  provider text NOT NULL,
  group_id text NOT NULL,
  authorized_by uuid NOT NULL REFERENCES users (id),
  consent_statement text NOT NULL CHECK (char_length(consent_statement) BETWEEN 10 AND 500),
  authorized_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE UNIQUE INDEX source_captures_one_active ON source_captures (provider, group_id) WHERE revoked_at IS NULL;
CREATE INDEX source_captures_source ON source_captures (source_id);

-- Diretório dos grupos que o número de captura conhece, gravado pelo processo do WhatsApp.
-- Só nome e quantidade de participantes: nenhuma pessoa, nenhuma mensagem.
CREATE TABLE whatsapp_groups (
  group_id text PRIMARY KEY,
  subject text NOT NULL,
  participants integer NOT NULL CHECK (participants >= 0),
  seen_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz
);

-- Candidatas da reconciliação ao vivo × importada (D-09): mesma fonte, horário próximo.
CREATE INDEX messages_source_sent_at ON messages (source_id, sent_at);

-- Down Migration
DROP INDEX messages_source_sent_at;
DROP TABLE whatsapp_groups;
DROP TABLE source_captures;
