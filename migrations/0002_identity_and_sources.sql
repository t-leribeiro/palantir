-- Up Migration
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE knowledge_spaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users (id),
  kind text NOT NULL CHECK (kind IN ('personal', 'shared')),
  retention_days integer CHECK (retention_days IS NULL OR retention_days > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Um espaço pessoal por usuário.
CREATE UNIQUE INDEX knowledge_spaces_one_personal ON knowledge_spaces (owner_user_id) WHERE kind = 'personal';

CREATE TABLE channel_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id),
  provider text NOT NULL,
  external_account_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'active', 'revoked')),
  verified_at timestamptz,
  UNIQUE (provider, external_account_id)
);

CREATE TABLE sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES knowledge_spaces (id),
  channel_account_id uuid NOT NULL REFERENCES channel_accounts (id),
  external_conversation_id text NOT NULL,
  title text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('group', 'direct')),
  status text NOT NULL DEFAULT 'not_authorized'
    CHECK (status IN ('not_authorized', 'authorized', 'revoked', 'deleting')),
  UNIQUE (channel_account_id, external_conversation_id)
);

-- Down Migration
DROP TABLE sources;
DROP TABLE channel_accounts;
DROP TABLE knowledge_spaces;
DROP TABLE users;
