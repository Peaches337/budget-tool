-- CoinSpot read-only API integration

CREATE TABLE IF NOT EXISTS coinspot_connections (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  encrypted_api_key   TEXT        NOT NULL,
  encrypted_api_secret TEXT       NOT NULL,
  status              TEXT        NOT NULL DEFAULT 'active'
                                  CHECK (status IN ('active', 'error', 'revoked')),
  last_synced_at      TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS coinspot_balances (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  coin_type   TEXT        NOT NULL,
  balance     NUMERIC(24, 8) NOT NULL DEFAULT 0,
  aud_balance NUMERIC(18, 2) NOT NULL DEFAULT 0,
  rate        NUMERIC(18, 2) NOT NULL DEFAULT 0,
  synced_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, coin_type)
);
