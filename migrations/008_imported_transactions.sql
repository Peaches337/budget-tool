-- Imported bank statement transactions (CSV uploads from ANZ, CommBank, etc.)

CREATE TABLE IF NOT EXISTS imported_files (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename    TEXT        NOT NULL,
  bank_name   TEXT        NOT NULL,
  row_count   INT         NOT NULL DEFAULT 0,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS imported_transactions (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_id          UUID        NOT NULL REFERENCES imported_files(id) ON DELETE CASCADE,
  settled_at       DATE        NOT NULL,
  description      TEXT        NOT NULL,
  amount_cents     INT         NOT NULL,
  currency         TEXT        NOT NULL DEFAULT 'AUD',
  balance_cents    INT,
  budget_item_id   UUID        REFERENCES budget_items(id) ON DELETE SET NULL,
  match_confidence TEXT        CHECK (match_confidence IN ('high','medium','low','unmatched')),
  match_confirmed  BOOLEAN     NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_imported_tx_user ON imported_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_imported_tx_file ON imported_transactions(file_id);
