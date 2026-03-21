ALTER TABLE "crossings"
  ADD COLUMN IF NOT EXISTS "source_draft_id" uuid;

ALTER TABLE "crossings"
  ADD CONSTRAINT "crossings_source_draft_fk"
  FOREIGN KEY ("source_draft_id")
  REFERENCES "crossing_drafts"("id")
  ON DELETE NO ACTION
  ON UPDATE NO ACTION;

CREATE UNIQUE INDEX IF NOT EXISTS "crossings_source_draft_unique"
  ON "crossings" ("source_draft_id")
  WHERE "source_draft_id" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "crossing_replies_pending_unique"
  ON "crossing_replies" ("crossing_id", "replier_id")
  WHERE "status" = 'pending';
