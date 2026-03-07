-- Crossing and Shift (Screen 7)
CREATE TYPE "crossing_draft_status" AS ENUM ('draft', 'complete', 'abandoned');
CREATE TYPE "shift_draft_status" AS ENUM ('draft', 'complete', 'abandoned');

CREATE TABLE IF NOT EXISTS "crossing_drafts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL REFERENCES "conversations"("id"),
  "initiator_id" uuid NOT NULL REFERENCES "users"("id"),
  "sentence_a" text,
  "sentence_b" text,
  "context" text,
  "status" "crossing_draft_status" DEFAULT 'draft' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "crossings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL REFERENCES "conversations"("id"),
  "participant_a" uuid NOT NULL REFERENCES "users"("id"),
  "participant_b" uuid NOT NULL REFERENCES "users"("id"),
  "sentence" text NOT NULL,
  "context" text,
  "image_url" text,
  "created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "shift_drafts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL REFERENCES "conversations"("id"),
  "initiator_id" uuid NOT NULL REFERENCES "users"("id"),
  "a_before" text,
  "a_after" text,
  "b_before" text,
  "b_after" text,
  "status" "shift_draft_status" DEFAULT 'draft' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "shifts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL REFERENCES "conversations"("id"),
  "participant_a" uuid NOT NULL REFERENCES "users"("id"),
  "participant_b" uuid NOT NULL REFERENCES "users"("id"),
  "a_before" text NOT NULL,
  "a_after" text NOT NULL,
  "b_before" text NOT NULL,
  "b_after" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "crossing_drafts_conversation_idx" ON "crossing_drafts" ("conversation_id");
CREATE INDEX IF NOT EXISTS "crossings_conversation_idx" ON "crossings" ("conversation_id");
CREATE INDEX IF NOT EXISTS "crossings_participant_a_idx" ON "crossings" ("participant_a");
CREATE INDEX IF NOT EXISTS "crossings_participant_b_idx" ON "crossings" ("participant_b");
CREATE INDEX IF NOT EXISTS "shift_drafts_conversation_idx" ON "shift_drafts" ("conversation_id");
CREATE INDEX IF NOT EXISTS "shifts_conversation_idx" ON "shifts" ("conversation_id");
CREATE INDEX IF NOT EXISTS "shifts_participant_a_idx" ON "shifts" ("participant_a");
CREATE INDEX IF NOT EXISTS "shifts_participant_b_idx" ON "shifts" ("participant_b");
