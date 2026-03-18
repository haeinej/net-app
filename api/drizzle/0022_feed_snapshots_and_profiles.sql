CREATE TABLE IF NOT EXISTS "user_feed_profiles" (
  "user_id" uuid PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "resonance_centroid" vector(768),
  "surface_centroid" vector(768),
  "recent_cluster_ids" uuid[],
  "embedded_thought_count" integer NOT NULL DEFAULT 0,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "user_feed_profiles_updated_idx"
  ON "user_feed_profiles" ("updated_at" DESC);

CREATE TABLE IF NOT EXISTS "feed_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "viewer_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "config_version" text NOT NULL,
  "items" jsonb NOT NULL,
  "traces" jsonb NOT NULL,
  "has_more" boolean NOT NULL DEFAULT false,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "feed_snapshots_viewer_expires_idx"
  ON "feed_snapshots" ("viewer_id", "expires_at" DESC);

CREATE INDEX IF NOT EXISTS "feed_snapshots_expires_idx"
  ON "feed_snapshots" ("expires_at");

CREATE INDEX IF NOT EXISTS "crossings_participant_a_created_idx"
  ON "crossings" ("participant_a", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "crossings_participant_b_created_idx"
  ON "crossings" ("participant_b", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "messages_conversation_created_id_desc_idx"
  ON "messages" ("conversation_id", "created_at" DESC, "id" DESC);

CREATE INDEX IF NOT EXISTS "conversations_participant_a_last_message_idx"
  ON "conversations" ("participant_a", "last_message_at" DESC);

CREATE INDEX IF NOT EXISTS "conversations_participant_b_last_message_idx"
  ON "conversations" ("participant_b", "last_message_at" DESC);
