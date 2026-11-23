-- Up Migration
-- Recibo de cada mensagem dirigida ao agente (feature 003, D-13): evita responder duas vezes quando o
-- provedor reentrega. Sem texto, número ou remetente (RN-04 e privacidade).
CREATE TABLE agent_inbound_receipts (
  provider text NOT NULL,
  external_message_id text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, external_message_id)
);
CREATE INDEX agent_inbound_receipts_received_at ON agent_inbound_receipts (received_at);

-- Down Migration
DROP TABLE agent_inbound_receipts;
