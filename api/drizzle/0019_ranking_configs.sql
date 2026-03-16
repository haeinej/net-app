CREATE TABLE IF NOT EXISTS "ranking_configs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "version" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "notes" text,
  "config" jsonb NOT NULL,
  "is_active" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "activated_at" timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS "ranking_configs_active_unique"
  ON "ranking_configs" ("is_active")
  WHERE "is_active" = true;

CREATE INDEX IF NOT EXISTS "ranking_configs_updated_idx"
  ON "ranking_configs" ("updated_at" DESC);
