-- Skint budget app — initial schema

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Users ────────────────────────────────────────────────────────────────────

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      TEXT UNIQUE NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  is_admin      BOOLEAN NOT NULL DEFAULT false,
  totp_secret   TEXT,                          -- null until 2FA is enabled
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Sessions ─────────────────────────────────────────────────────────────────

CREATE TABLE sessions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX sessions_user_id_idx ON sessions(user_id);

-- ─── Households ───────────────────────────────────────────────────────────────

CREATE TABLE households (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE household_members (
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role         TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (household_id, user_id)
);

CREATE TABLE household_invites (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  code         TEXT UNIQUE NOT NULL,
  created_by   UUID NOT NULL REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ,
  used_at      TIMESTAMPTZ,
  used_by      UUID REFERENCES users(id)
);

-- ─── Templates ────────────────────────────────────────────────────────────────

CREATE TABLE templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  is_default  BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE template_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  color       TEXT NOT NULL,
  is_income   BOOLEAN NOT NULL DEFAULT false,
  sort_order  INT NOT NULL DEFAULT 0
);

CREATE TABLE template_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES template_categories(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  frequency   TEXT NOT NULL DEFAULT 'monthly'
    CHECK (frequency IN ('weekly','fortnightly','monthly','quarterly','annually')),
  taxable     TEXT NOT NULL DEFAULT 'taxfree' CHECK (taxable IN ('taxed','taxfree'))
);

-- ─── Budget categories (per user, seeded from template) ───────────────────────

CREATE TABLE budget_categories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  color      TEXT NOT NULL,
  is_income  BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0,
  -- visibility controls what household members can see
  visibility TEXT NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('private','amount_only','full')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX budget_categories_user_id_idx ON budget_categories(user_id);

-- ─── Budget items ─────────────────────────────────────────────────────────────

CREATE TABLE budget_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES budget_categories(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  frequency   TEXT NOT NULL DEFAULT 'monthly'
    CHECK (frequency IN ('weekly','fortnightly','monthly','quarterly','annually')),
  taxable     TEXT NOT NULL DEFAULT 'taxfree' CHECK (taxable IN ('taxed','taxfree')),
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX budget_items_user_id_idx     ON budget_items(user_id);
CREATE INDEX budget_items_category_id_idx ON budget_items(category_id);

-- ─── Australian template seed data ────────────────────────────────────────────

INSERT INTO templates (id, name, description, is_default) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Australian Household', 'Standard Australian household budget with tax calculations', true);

DO $$
DECLARE
  tid UUID := '00000000-0000-0000-0000-000000000001';
  cid UUID;
BEGIN
  -- Income
  INSERT INTO template_categories (id, template_id, name, color, is_income, sort_order)
    VALUES (gen_random_uuid(), tid, 'Income', '#1D9E75', true, 0) RETURNING id INTO cid;
  INSERT INTO template_items (category_id, label, frequency, taxable) VALUES
    (cid, 'Salary / wages (gross)',        'annually',    'taxed'),
    (cid, 'Partner salary (gross)',         'annually',    'taxed'),
    (cid, 'Sole trader / ABN income',       'annually',    'taxed'),
    (cid, 'Army Reserve',                   'annually',    'taxfree'),
    (cid, 'Income from savings / investments','annually',  'taxed'),
    (cid, 'Centrelink benefits',            'fortnightly', 'taxfree'),
    (cid, 'Family / child benefits',        'fortnightly', 'taxfree'),
    (cid, 'Other',                          'annually',    'taxfree');

  -- Home & utilities
  INSERT INTO template_categories (id, template_id, name, color, is_income, sort_order)
    VALUES (gen_random_uuid(), tid, 'Home & utilities', '#378ADD', false, 1) RETURNING id INTO cid;
  INSERT INTO template_items (category_id, label, frequency) VALUES
    (cid, 'Mortgage / rent',           'monthly'),
    (cid, 'Body corporate fees',       'quarterly'),
    (cid, 'Council rates',             'quarterly'),
    (cid, 'Furniture & appliances',    'annually'),
    (cid, 'Renovations & maintenance', 'annually'),
    (cid, 'Electricity',               'monthly'),
    (cid, 'Gas',                       'monthly'),
    (cid, 'Water',                     'quarterly'),
    (cid, 'Internet',                  'monthly'),
    (cid, 'Streaming & Pay TV',        'monthly'),
    (cid, 'Mobile',                    'monthly'),
    (cid, 'Other',                     'monthly');

  -- Insurance & financial
  INSERT INTO template_categories (id, template_id, name, color, is_income, sort_order)
    VALUES (gen_random_uuid(), tid, 'Insurance & financial', '#7F77DD', false, 2) RETURNING id INTO cid;
  INSERT INTO template_items (category_id, label, frequency) VALUES
    (cid, 'Car insurance',                    'monthly'),
    (cid, 'Home & contents insurance',        'monthly'),
    (cid, 'Life insurance',                   'monthly'),
    (cid, 'Health insurance',                 'monthly'),
    (cid, 'Income protection',                'monthly'),
    (cid, 'Car loan',                         'monthly'),
    (cid, 'Credit card interest',             'monthly'),
    (cid, 'Other loans',                      'monthly'),
    (cid, 'Savings / offset contributions',   'monthly'),
    (cid, 'Investments & super contributions','monthly'),
    (cid, 'Charity donations',               'monthly');

  -- Groceries
  INSERT INTO template_categories (id, template_id, name, color, is_income, sort_order)
    VALUES (gen_random_uuid(), tid, 'Groceries', '#D4537E', false, 3) RETURNING id INTO cid;
  INSERT INTO template_items (category_id, label, frequency) VALUES
    (cid, 'Supermarket',    'weekly'),
    (cid, 'Butcher',        'weekly'),
    (cid, 'Fruit & veg',    'weekly'),
    (cid, 'Fish shop',      'weekly'),
    (cid, 'Deli & bakery',  'weekly'),
    (cid, 'Pet food',       'weekly'),
    (cid, 'Other',          'monthly');

  -- Personal & medical
  INSERT INTO template_categories (id, template_id, name, color, is_income, sort_order)
    VALUES (gen_random_uuid(), tid, 'Personal & medical', '#BA7517', false, 4) RETURNING id INTO cid;
  INSERT INTO template_items (category_id, label, frequency) VALUES
    (cid, 'Cosmetics & toiletries',        'monthly'),
    (cid, 'Hair & beauty',                 'monthly'),
    (cid, 'Medicines & pharmacy',          'monthly'),
    (cid, 'Glasses & eye care',            'annually'),
    (cid, 'Dental',                        'annually'),
    (cid, 'Doctors & medical',             'monthly'),
    (cid, 'Sports & gym',                  'monthly'),
    (cid, 'Education',                     'monthly'),
    (cid, 'Pet care & vet',                'monthly'),
    (cid, 'Clothing & footwear',           'monthly'),
    (cid, 'Subscriptions (music, games)',  'monthly'),
    (cid, 'Other',                         'monthly');

  -- Entertainment
  INSERT INTO template_categories (id, template_id, name, color, is_income, sort_order)
    VALUES (gen_random_uuid(), tid, 'Entertainment', '#E24B4A', false, 5) RETURNING id INTO cid;
  INSERT INTO template_items (category_id, label, frequency) VALUES
    (cid, 'Coffee & tea',        'weekly'),
    (cid, 'Lunches bought',      'weekly'),
    (cid, 'Takeaway & snacks',   'weekly'),
    (cid, 'Drinks & alcohol',    'weekly'),
    (cid, 'Bars & clubs',        'monthly'),
    (cid, 'Restaurants',         'monthly'),
    (cid, 'Movies & events',     'monthly'),
    (cid, 'Holidays',            'annually'),
    (cid, 'Celebrations & gifts','monthly'),
    (cid, 'Other',               'monthly');

  -- Transport
  INSERT INTO template_categories (id, template_id, name, color, is_income, sort_order)
    VALUES (gen_random_uuid(), tid, 'Transport', '#888780', false, 6) RETURNING id INTO cid;
  INSERT INTO template_items (category_id, label, frequency) VALUES
    (cid, 'Bus / train / ferry',   'weekly'),
    (cid, 'Petrol',                'monthly'),
    (cid, 'Road tolls & parking',  'weekly'),
    (cid, 'Rego & licence',        'annually'),
    (cid, 'Repairs & maintenance', 'annually'),
    (cid, 'Fines',                 'annually'),
    (cid, 'Airfares',              'annually'),
    (cid, 'Other',                 'monthly');

  -- Children
  INSERT INTO template_categories (id, template_id, name, color, is_income, sort_order)
    VALUES (gen_random_uuid(), tid, 'Children', '#639922', false, 7) RETURNING id INTO cid;
  INSERT INTO template_items (category_id, label, frequency) VALUES
    (cid, 'Baby products',               'monthly'),
    (cid, 'Toys',                        'monthly'),
    (cid, 'Babysitting / childcare',     'monthly'),
    (cid, 'Sports & activities',         'monthly'),
    (cid, 'School fees',                 'monthly'),
    (cid, 'Excursions',                  'monthly'),
    (cid, 'School uniforms & supplies',  'annually'),
    (cid, 'Child support paid',          'monthly'),
    (cid, 'Other',                       'monthly');
END $$;
