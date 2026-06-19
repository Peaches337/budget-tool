-- Skint — templates, admin, subscriptions, config, audit

-- ─── Subscription tiers ───────────────────────────────────────────────────────

CREATE TABLE subscription_tiers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service    TEXT NOT NULL,
  tier_name  TEXT NOT NULL,
  amount     NUMERIC(8,2) NOT NULL,
  frequency  TEXT NOT NULL DEFAULT 'monthly'
    CHECK (frequency IN ('weekly','fortnightly','monthly','quarterly','annually')),
  sort_order INT NOT NULL DEFAULT 0,
  active     BOOLEAN NOT NULL DEFAULT true
);

-- ─── App config ───────────────────────────────────────────────────────────────

CREATE TABLE app_config (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Audit log ────────────────────────────────────────────────────────────────

CREATE TABLE audit_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  username   TEXT,
  action     TEXT NOT NULL,
  entity     TEXT,
  entity_id  TEXT,
  details    JSONB,
  ip         TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX audit_log_created_at_idx ON audit_log(created_at DESC);
CREATE INDEX audit_log_user_id_idx    ON audit_log(user_id);

-- ─── Template visibility + ownership ─────────────────────────────────────────

ALTER TABLE templates
  ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('private','household','public')),
  ADD COLUMN created_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- ─── Service keys (links budget/template items to a subscription service) ─────

ALTER TABLE template_items ADD COLUMN service_key TEXT;
ALTER TABLE budget_items   ADD COLUMN service_key TEXT;

-- ─── Category enabled flag ────────────────────────────────────────────────────

ALTER TABLE budget_categories ADD COLUMN enabled BOOLEAN NOT NULL DEFAULT true;

-- ─── Default app config ───────────────────────────────────────────────────────

INSERT INTO app_config (key, value) VALUES
  ('instance_name',        'Skint'),
  ('registration_open',    'true'),
  ('default_template',     '00000000-0000-0000-0000-000000000001'),
  ('session_timeout_days', '30');

-- ─── Subscription tier seed data ─────────────────────────────────────────────

INSERT INTO subscription_tiers (service, tier_name, amount, frequency, sort_order) VALUES
  ('Netflix',               'Standard with Ads',              9.99,  'monthly',  0),
  ('Netflix',               'Standard',                      20.99,  'monthly',  1),
  ('Netflix',               'Standard + extra member (Ads)', 16.98,  'monthly',  2),
  ('Netflix',               'Standard + extra member',       27.98,  'monthly',  3),
  ('Netflix',               'Premium',                       28.99,  'monthly',  4),
  ('Netflix',               'Premium + extra member (Ads)',  35.98,  'monthly',  5),
  ('Netflix',               'Premium + extra member',        37.98,  'monthly',  6),
  ('Stan',                  'Basic',                         10.00,  'monthly',  0),
  ('Stan',                  'Standard',                      14.00,  'monthly',  1),
  ('Stan',                  'Premium',                       19.00,  'monthly',  2),
  ('Disney+',               'Standard',                      13.99,  'monthly',  0),
  ('Disney+',               'Premium',                       17.99,  'monthly',  1),
  ('Binge',                 'Basic',                         10.00,  'monthly',  0),
  ('Binge',                 'Standard',                      18.00,  'monthly',  1),
  ('Binge',                 'Max',                           22.00,  'monthly',  2),
  ('Amazon Prime Video',    'Monthly',                        9.99,  'monthly',  0),
  ('Amazon Prime Video',    'Annual',                        99.00,  'annually', 1),
  ('Spotify',               'Individual',                    11.99,  'monthly',  0),
  ('Spotify',               'Duo',                           15.99,  'monthly',  1),
  ('Spotify',               'Family',                        17.99,  'monthly',  2),
  ('Apple TV+',             'Monthly',                        9.99,  'monthly',  0),
  ('Apple TV+',             'Annual',                        99.00,  'annually', 1),
  ('YouTube Premium',       'Individual',                    14.99,  'monthly',  0),
  ('YouTube Premium',       'Family',                        22.99,  'monthly',  1),
  ('Paramount+',            'Monthly',                        8.99,  'monthly',  0);

-- ─── Update default template ──────────────────────────────────────────────────

DO $$
DECLARE
  tid UUID := '00000000-0000-0000-0000-000000000001';
  cid UUID;
BEGIN

  -- Replace income items with structured Australian income sources
  SELECT id INTO cid FROM template_categories
    WHERE template_id = tid AND is_income = true LIMIT 1;

  DELETE FROM template_items WHERE category_id = cid;

  INSERT INTO template_items (category_id, label, frequency, taxable) VALUES
    (cid, 'Primary income',       'annually',    'taxed'),
    (cid, 'Secondary income',     'annually',    'taxed'),
    (cid, 'Investment income',    'annually',    'taxed'),
    (cid, 'Pension',              'fortnightly', 'taxfree'),
    (cid, 'Centrelink / benefits','fortnightly', 'taxfree'),
    (cid, 'Other',                'annually',    'taxfree');

  -- Remove "Streaming & Pay TV" — moving to Subscriptions category
  DELETE FROM template_items ti
    USING template_categories tc
    WHERE ti.category_id = tc.id
      AND tc.template_id = tid
      AND tc.name = 'Home & utilities'
      AND ti.label = 'Streaming & Pay TV';

  -- Remove "Subscriptions (music, games)" — moving to Subscriptions category
  DELETE FROM template_items ti
    USING template_categories tc
    WHERE ti.category_id = tc.id
      AND tc.template_id = tid
      AND tc.name = 'Personal & medical'
      AND ti.label = 'Subscriptions (music, games)';

  -- Add dedicated Subscriptions category
  INSERT INTO template_categories (template_id, name, color, is_income, sort_order)
    VALUES (tid, 'Subscriptions', '#8B5CF6', false, 8)
    RETURNING id INTO cid;

  INSERT INTO template_items (category_id, label, frequency, taxable, service_key) VALUES
    (cid, 'Netflix',             'monthly', 'taxfree', 'Netflix'),
    (cid, 'Stan',                'monthly', 'taxfree', 'Stan'),
    (cid, 'Disney+',             'monthly', 'taxfree', 'Disney+'),
    (cid, 'Binge',               'monthly', 'taxfree', 'Binge'),
    (cid, 'Amazon Prime Video',  'monthly', 'taxfree', 'Amazon Prime Video'),
    (cid, 'Spotify',             'monthly', 'taxfree', 'Spotify'),
    (cid, 'Apple TV+',           'monthly', 'taxfree', 'Apple TV+'),
    (cid, 'YouTube Premium',     'monthly', 'taxfree', 'YouTube Premium'),
    (cid, 'Paramount+',          'monthly', 'taxfree', 'Paramount+'),
    (cid, 'Other',               'monthly', 'taxfree', NULL);

END $$;
