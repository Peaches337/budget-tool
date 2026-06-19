-- Registration invite tokens (allows new users to register on private servers)
CREATE TABLE IF NOT EXISTS registration_invites (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token      TEXT NOT NULL UNIQUE,
  created_by UUID NOT NULL REFERENCES users(id),
  expires_at TIMESTAMPTZ,
  used_at    TIMESTAMPTZ,
  used_by    UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
