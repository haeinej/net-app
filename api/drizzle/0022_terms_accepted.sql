-- Track server-side EULA/Terms acceptance per user
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;
