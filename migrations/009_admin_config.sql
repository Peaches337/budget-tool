-- Admin configuration table
CREATE TABLE IF NOT EXISTS admin_config (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Default: open registration
INSERT INTO admin_config (key, value) VALUES ('allow_registration', 'true')
ON CONFLICT (key) DO NOTHING;
