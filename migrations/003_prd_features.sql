-- PRD features: irregular income, canonical keys, net worth, tax brackets

-- ── Irregular income additions ────────────────────────────────────────────────

ALTER TABLE budget_items
  ADD COLUMN IF NOT EXISTS is_irregular       BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS declared_annual    NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS rolling_avg_months INT          NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS tax_treatment      TEXT         NOT NULL DEFAULT 'taxable'
    CHECK (tax_treatment IN ('taxable','tax_free','already_taxed')),
  ADD COLUMN IF NOT EXISTS nudge_dismissed_until TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS income_actuals (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_item_id UUID        NOT NULL REFERENCES budget_items(id) ON DELETE CASCADE,
  user_id        UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  paid_on        DATE        NOT NULL,
  amount         NUMERIC(12,2) NOT NULL,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS income_actuals_item_idx ON income_actuals(budget_item_id);
CREATE INDEX IF NOT EXISTS income_actuals_user_idx ON income_actuals(user_id);

-- ── Canonical keys ────────────────────────────────────────────────────────────

ALTER TABLE template_categories
  ADD COLUMN IF NOT EXISTS canonical_key TEXT;

ALTER TABLE budget_categories
  ADD COLUMN IF NOT EXISTS canonical_key TEXT;

-- ── Net worth ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS net_worth_entries (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entry_type   TEXT        NOT NULL CHECK (entry_type IN ('asset','liability')),
  category     TEXT        NOT NULL,
  label        TEXT        NOT NULL,
  institution  TEXT,
  amount       NUMERIC(14,2) NOT NULL DEFAULT 0,
  visibility   TEXT        NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('private','shared')),
  last_updated TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS net_worth_entries_user_idx ON net_worth_entries(user_id);

CREATE TABLE IF NOT EXISTS net_worth_snapshots (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  snapped_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  total_assets   NUMERIC(14,2) NOT NULL,
  total_liab     NUMERIC(14,2) NOT NULL,
  net_worth      NUMERIC(14,2) NOT NULL
);

CREATE INDEX IF NOT EXISTS net_worth_snapshots_user_idx ON net_worth_snapshots(user_id, snapped_at DESC);

-- ── Tax brackets (DB-stored) ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tax_brackets (
  id            UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  tax_year      INT   NOT NULL,  -- e.g. 2025 = FY2024-25
  threshold_from NUMERIC(12,2) NOT NULL,
  threshold_to   NUMERIC(12,2),  -- NULL = no upper bound
  rate           NUMERIC(5,4)  NOT NULL,
  base_tax       NUMERIC(12,2) NOT NULL DEFAULT 0,
  UNIQUE (tax_year, threshold_from)
);

-- 2024-25 brackets
INSERT INTO tax_brackets (tax_year, threshold_from, threshold_to, rate, base_tax) VALUES
  (2025,      0,     18200, 0.00,   0),
  (2025,  18201,     45000, 0.16,   0),
  (2025,  45001,    135000, 0.30,   4288),
  (2025, 135001,    190000, 0.37,  31288),
  (2025, 190001,      NULL, 0.45,  51638)
ON CONFLICT (tax_year, threshold_from) DO NOTHING;

-- 2026-27 brackets (announced)
INSERT INTO tax_brackets (tax_year, threshold_from, threshold_to, rate, base_tax) VALUES
  (2027,      0,     18200, 0.00,   0),
  (2027,  18201,     45000, 0.15,   0),
  (2027,  45001,    135000, 0.30,   4050),
  (2027, 135001,    190000, 0.37,  31050),
  (2027, 190001,      NULL, 0.45,  51400)
ON CONFLICT (tax_year, threshold_from) DO NOTHING;

-- ── Wizard flag on users ──────────────────────────────────────────────────────

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS wizard_completed BOOLEAN NOT NULL DEFAULT false;
