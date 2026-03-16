CREATE TABLE IF NOT EXISTS "feed_serves" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "request_id" text NOT NULL,
  "viewer_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "item_type" text NOT NULL,
  "thought_id" uuid REFERENCES "thoughts"("id") ON DELETE SET NULL,
  "crossing_id" uuid,
  "author_id" uuid REFERENCES "users"("id") ON DELETE CASCADE,
  "position" integer NOT NULL,
  "bucket" text,
  "stage" text,
  "phase_used" text,
  "score_q" real,
  "score_d" real,
  "score_f" real,
  "score_r" real,
  "final_rank" real,
  "resonance_similarity" real,
  "surface_similarity" real,
  "config_version" text NOT NULL,
  "served_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "feed_serves_request_position_unique"
  ON "feed_serves" ("request_id", "position");

CREATE INDEX IF NOT EXISTS "feed_serves_viewer_served_idx"
  ON "feed_serves" ("viewer_id", "served_at" DESC);

CREATE INDEX IF NOT EXISTS "feed_serves_thought_served_idx"
  ON "feed_serves" ("thought_id", "served_at" DESC);

CREATE INDEX IF NOT EXISTS "feed_serves_bucket_served_idx"
  ON "feed_serves" ("bucket", "served_at" DESC);
