-- Up Migration
-- Gestão de fontes pelo agente (feature 006, data-delta.md): verificação de posse da conta, estado curto da
-- conversa com o agente, exclusão de fonte em duas etapas e auditoria sem conteúdo.

-- Códigos de verificação de posse (D-11): só o hash com sal, uso único, 10 min, até 5 tentativas.
CREATE TABLE channel_account_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES channel_accounts (id) ON DELETE CASCADE,
  code_salt bytea NOT NULL,
  code_hash bytea NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  consumed_at timestamptz,
  invalidated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Um código vivo por conta: pedir outro invalida o anterior.
CREATE UNIQUE INDEX channel_account_verifications_one_live ON channel_account_verifications (account_id)
  WHERE consumed_at IS NULL AND invalidated_at IS NULL;

-- Estado curto da conversa com o agente (D-02): a última lista (30 min) e a ação pendente (5 min).
CREATE TABLE agent_conversation_state (
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  provider text NOT NULL,
  listing jsonb,
  listing_page integer CHECK (listing_page IS NULL OR listing_page >= 1),
  listing_at timestamptz,
  pending jsonb,
  pending_expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, provider)
);

-- Pedidos de exclusão de fonte (D-07, D-08). Sem FK para a fonte: ela deixa de existir ao fim.
CREATE TABLE source_deletions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL,
  space_id uuid NOT NULL REFERENCES knowledge_spaces (id),
  requested_by uuid NOT NULL REFERENCES users (id),
  notify_provider text,
  notify_account text,
  notify_title text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  messages_deleted integer CHECK (messages_deleted IS NULL OR messages_deleted >= 0),
  audios_deleted integer CHECK (audios_deleted IS NULL OR audios_deleted >= 0),
  objects_deleted integer CHECK (objects_deleted IS NULL OR objects_deleted >= 0),
  notified_at timestamptz,
  CHECK ((notify_provider IS NULL) = (notify_account IS NULL))
);
CREATE INDEX source_deletions_in_progress ON source_deletions (requested_at) WHERE completed_at IS NULL;
-- Um pedido em andamento por fonte.
CREATE UNIQUE INDEX source_deletions_one_open ON source_deletions (source_id) WHERE completed_at IS NULL;

-- Auditoria (D-13): sem FK para o alvo (sobrevive à exclusão) e sem nomes, telefones ou texto.
CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES users (id),
  action text NOT NULL CHECK (action IN (
    'account.link_requested', 'account.verified', 'account.verification_locked',
    'capture.authorized', 'capture.revoked',
    'source.deletion_requested', 'source.deleted'
  )),
  target_kind text NOT NULL CHECK (target_kind IN ('channel_account', 'source')),
  target_id uuid NOT NULL,
  channel text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_at ON audit_events (at DESC);

-- Catálogo de nomes e lista de gestão por espaço.
CREATE INDEX sources_space ON sources (space_id);

-- RF-15: contas ativas sem verificação voltam a pendente até mandar o código. O canal de teste não tem posse a provar.
UPDATE channel_accounts SET status = 'pending' WHERE status = 'active' AND verified_at IS NULL AND provider <> 'fake';

-- Down Migration
-- As contas que voltaram a pendente não são reativadas: basta repetir `npm run whatsapp:link`.
DROP INDEX sources_space;
DROP TABLE audit_events;
DROP TABLE source_deletions;
DROP TABLE agent_conversation_state;
DROP TABLE channel_account_verifications;
