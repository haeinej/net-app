-- Add sentence_b to crossing_drafts and crossings for separate participant sentences
ALTER TABLE "crossing_drafts" ADD COLUMN "sentence_b" text;
ALTER TABLE "crossings" ADD COLUMN "sentence_a" text;
ALTER TABLE "crossings" ADD COLUMN "sentence_b" text;

-- Backfill: copy existing sentence into sentence_a for completed crossings
UPDATE "crossings" SET "sentence_a" = "sentence" WHERE "sentence_a" IS NULL;
