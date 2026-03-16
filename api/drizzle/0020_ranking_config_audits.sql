CREATE TABLE IF NOT EXISTS "ranking_config_audits" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "config_version" text NOT NULL,
  "action" text NOT NULL,
  "outcome" text NOT NULL DEFAULT 'success',
  "previous_active_version" text,
  "actor" text,
  "reason" text,
  "source" text,
  "request_ip" text,
  "user_agent" text,
  "config_snapshot" jsonb,
  "metadata" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ranking_config_audits_config_created_idx"
  ON "ranking_config_audits" ("config_version", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "ranking_config_audits_created_idx"
  ON "ranking_config_audits" ("created_at" DESC);
