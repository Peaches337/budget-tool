-- Bank integration: Up Bank read-only transaction sync

CREATE TABLE IF NOT EXISTS bank_connections (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider         TEXT        NOT NULL DEFAULT 'up'
                               CHECK (provider IN ('up')),
  encrypted_token  TEXT        NOT NULL,
  display_name     TEXT,
  status           TEXT        NOT NULL DEFAULT 'active'
                               CHECK (status IN ('active', 'error', 'revoked')),
  last_synced_at   TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);

CREATE TABLE IF NOT EXISTS bank_transactions (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_id       UUID        NOT NULL REFERENCES bank_connections(id) ON DELETE CASCADE,
  external_id         TEXT        NOT NULL,
  merchant_raw        TEXT,
  merchant_normalised TEXT,
  amount_cents        BIGINT      NOT NULL,
  currency            TEXT        NOT NULL DEFAULT 'AUD',
  description         TEXT,
  up_category         TEXT,
  status              TEXT        NOT NULL DEFAULT 'settled'
                                  CHECK (status IN ('held', 'settled')),
  budget_item_id      UUID        REFERENCES budget_items(id) ON DELETE SET NULL,
  match_confidence    TEXT        CHECK (match_confidence IN ('high', 'medium', 'low', 'manual', 'unmatched')),
  match_confirmed     BOOLEAN     NOT NULL DEFAULT false,
  settled_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  source              TEXT        NOT NULL DEFAULT 'pull'
                                  CHECK (source IN ('webhook', 'pull', 'disconnected')),
  UNIQUE (user_id, external_id)
);

CREATE INDEX IF NOT EXISTS bank_tx_user_idx        ON bank_transactions(user_id);
CREATE INDEX IF NOT EXISTS bank_tx_settled_idx     ON bank_transactions(user_id, settled_at DESC);
CREATE INDEX IF NOT EXISTS bank_tx_unmatched_idx   ON bank_transactions(user_id, match_confidence)
  WHERE match_confidence IS NULL OR match_confidence = 'unmatched';

CREATE TABLE IF NOT EXISTS bank_merchant_mappings (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  merchant_normalised TEXT        NOT NULL,
  budget_item_id      UUID        NOT NULL REFERENCES budget_items(id) ON DELETE CASCADE,
  confirmed           BOOLEAN     NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, merchant_normalised)
);

CREATE INDEX IF NOT EXISTS bank_mapping_user_idx ON bank_merchant_mappings(user_id);

CREATE TABLE IF NOT EXISTS bank_account_balances (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_id        UUID        NOT NULL REFERENCES bank_connections(id) ON DELETE CASCADE,
  external_account_id  TEXT        NOT NULL,
  display_name         TEXT,
  account_type         TEXT        NOT NULL DEFAULT 'TRANSACTIONAL'
                                   CHECK (account_type IN ('TRANSACTIONAL', 'SAVER', 'HOME_LOAN')),
  balance_cents        BIGINT      NOT NULL DEFAULT 0,
  currency             TEXT        NOT NULL DEFAULT 'AUD',
  synced_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, external_account_id)
);

CREATE INDEX IF NOT EXISTS bank_balances_user_idx ON bank_account_balances(user_id);
