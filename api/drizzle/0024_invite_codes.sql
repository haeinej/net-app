-- Add invited_by_user_id to users
ALTER TABLE "users" ADD COLUMN "invited_by_user_id" uuid;

-- Create invite_codes table
CREATE TABLE IF NOT EXISTS "invite_codes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "code" text NOT NULL,
  "created_by_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "redeemed_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "redeemed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now()
);

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "invite_codes_code_unique" ON "invite_codes" ("code");
CREATE INDEX IF NOT EXISTS "invite_codes_created_by_idx" ON "invite_codes" ("created_by_user_id");
