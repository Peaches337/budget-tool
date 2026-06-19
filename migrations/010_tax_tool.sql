-- Profile type on existing tables
ALTER TABLE budget_categories ADD COLUMN IF NOT EXISTS profile_type TEXT NOT NULL DEFAULT 'personal' CHECK (profile_type IN ('personal', 'business'));
ALTER TABLE net_worth_entries ADD COLUMN IF NOT EXISTS profile_type TEXT NOT NULL DEFAULT 'personal' CHECK (profile_type IN ('personal', 'business'));
ALTER TABLE imported_transactions ADD COLUMN IF NOT EXISTS profile_type TEXT NOT NULL DEFAULT 'personal' CHECK (profile_type IN ('personal', 'business'));

-- Business profile per user
CREATE TABLE IF NOT EXISTS business_profiles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  abn             TEXT,
  gst_registered  BOOLEAN NOT NULL DEFAULT false,
  gst_number      TEXT,
  usi             TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tax user settings (per user per FY)
CREATE TABLE IF NOT EXISTS tax_user_settings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  financial_year      INT NOT NULL,  -- e.g. 2025 = FY2024-25 (Jul 2024 - Jun 2025)
  tax_role            TEXT NOT NULL DEFAULT 'payg' CHECK (tax_role IN ('payg', 'sole_trader', 'both')),
  home_office_method  TEXT CHECK (home_office_method IN ('fixed_rate', 'actual_cost')),
  travel_method       TEXT NOT NULL DEFAULT 'cents_per_km' CHECK (travel_method IN ('cents_per_km', 'logbook')),
  -- module toggles
  mod_work_expenses   BOOLEAN NOT NULL DEFAULT true,
  mod_vehicle         BOOLEAN NOT NULL DEFAULT false,
  mod_home_office     BOOLEAN NOT NULL DEFAULT false,
  mod_internet        BOOLEAN NOT NULL DEFAULT false,
  mod_mobile          BOOLEAN NOT NULL DEFAULT false,
  mod_electricity     BOOLEAN NOT NULL DEFAULT false,
  mod_gas             BOOLEAN NOT NULL DEFAULT false,
  mod_water           BOOLEAN NOT NULL DEFAULT false,
  mod_fuel            BOOLEAN NOT NULL DEFAULT false,
  mod_interest        BOOLEAN NOT NULL DEFAULT false,
  mod_professional    BOOLEAN NOT NULL DEFAULT false,
  mod_vehicle_service BOOLEAN NOT NULL DEFAULT false,
  wizard_complete     BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, financial_year)
);

-- Generic itemised tax entries (work expenses, professional dev, etc.)
CREATE TABLE IF NOT EXISTS tax_entries (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  financial_year      INT NOT NULL,
  module_type         TEXT NOT NULL CHECK (module_type IN (
    'work_expense', 'client_expense', 'vehicle_service',
    'fuel', 'professional_dev', 'interest', 'business_income',
    'business_expense', 'depreciation', 'super', 'insurance', 'accounting'
  )),
  entry_date          DATE NOT NULL,
  description         TEXT NOT NULL,
  supplier            TEXT,
  amount_cents        INT NOT NULL,
  work_pct            INT NOT NULL DEFAULT 100 CHECK (work_pct BETWEEN 0 AND 100),
  deductible_cents    INT GENERATED ALWAYS AS (amount_cents * work_pct / 100) STORED,
  receipt_url         TEXT,
  linked_tx_id        UUID,  -- bank_transaction or imported_transaction id
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Home office config per FY
CREATE TABLE IF NOT EXISTS tax_home_office (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  financial_year      INT NOT NULL,
  method              TEXT NOT NULL CHECK (method IN ('fixed_rate', 'actual_cost')),
  hours_per_week      NUMERIC(5,2),               -- fixed rate method
  weeks_in_fy         INT NOT NULL DEFAULT 52,    -- can override for part-year
  office_area_m2      NUMERIC(6,2),               -- actual cost method
  total_area_m2       NUMERIC(6,2),               -- actual cost method
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, financial_year)
);

-- Monthly utility bills per FY
CREATE TABLE IF NOT EXISTS tax_utility_bills (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  financial_year  INT NOT NULL,
  utility_type    TEXT NOT NULL CHECK (utility_type IN ('electricity', 'gas', 'internet', 'mobile', 'water')),
  bill_month      INT NOT NULL CHECK (bill_month BETWEEN 1 AND 12),
  bill_year       INT NOT NULL,
  amount_cents    INT NOT NULL,
  work_pct        INT NOT NULL DEFAULT 50 CHECK (work_pct BETWEEN 0 AND 100),
  deductible_cents INT GENERATED ALWAYS AS (amount_cents * work_pct / 100) STORED,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, financial_year, utility_type, bill_month, bill_year)
);

-- Vehicle travel log
CREATE TABLE IF NOT EXISTS tax_travel_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  financial_year  INT NOT NULL,
  travel_date     DATE NOT NULL,
  origin          TEXT,
  destination     TEXT NOT NULL,
  purpose         TEXT NOT NULL,
  kilometres      NUMERIC(8,2) NOT NULL,
  rate_cents      INT NOT NULL DEFAULT 88,   -- 88c/km for FY2024-25
  deductible_cents INT GENERATED ALWAYS AS (ROUND(kilometres * rate_cents)::INT) STORED,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ATO cents per km rate per FY (admin-updatable)
CREATE TABLE IF NOT EXISTS tax_travel_rates (
  financial_year  INT PRIMARY KEY,
  rate_cents      INT NOT NULL  -- e.g. 88 = 88c/km
);
INSERT INTO tax_travel_rates (financial_year, rate_cents) VALUES (2025, 88) ON CONFLICT DO NOTHING;
INSERT INTO tax_travel_rates (financial_year, rate_cents) VALUES (2026, 88) ON CONFLICT DO NOTHING;
