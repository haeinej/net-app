ALTER TYPE "crossing_draft_status" ADD VALUE IF NOT EXISTS 'awaiting_other';
--> statement-breakpoint
ALTER TYPE "crossing_draft_status" ADD VALUE IF NOT EXISTS 'auto_posted';
--> statement-breakpoint
ALTER TABLE "crossing_drafts"
  ADD COLUMN IF NOT EXISTS "submitted_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "auto_post_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "auto_posted_thought_id" uuid REFERENCES "thoughts"("id");
--> statement-breakpoint
DROP INDEX IF EXISTS "crossing_drafts_active_conversation_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "crossing_drafts_active_conversation_unique"
ON "crossing_drafts" ("conversation_id")
WHERE "status" in ('draft', 'awaiting_other');
