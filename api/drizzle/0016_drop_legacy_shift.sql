ALTER TABLE "crossing_drafts"
  DROP COLUMN IF EXISTS "sentence_b";
--> statement-breakpoint
DROP TABLE IF EXISTS "shift_drafts";
--> statement-breakpoint
DROP TABLE IF EXISTS "shifts";
--> statement-breakpoint
DROP TYPE IF EXISTS "shift_draft_status";
