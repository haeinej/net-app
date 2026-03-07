-- Auth: email + password for login
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email" text UNIQUE;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_hash" text;
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_unique" ON "users" ("email") WHERE "email" IS NOT NULL;
