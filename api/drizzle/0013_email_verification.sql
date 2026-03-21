ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "email_verified_at" timestamp with time zone;

UPDATE "users"
SET "email_verified_at" = COALESCE("email_verified_at", "created_at")
WHERE "email" IS NOT NULL
  AND "password_hash" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "email_verification_codes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "code_hash" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "consumed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_verification_codes_user_created_idx"
ON "email_verification_codes" USING btree ("user_id","created_at" DESC);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "email_verification_codes_active_user_unique"
ON "email_verification_codes" ("user_id")
WHERE "consumed_at" IS NULL;
