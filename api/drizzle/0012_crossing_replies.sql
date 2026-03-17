CREATE TABLE IF NOT EXISTS "crossing_replies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "crossing_id" uuid NOT NULL REFERENCES "crossings"("id"),
  "replier_id" uuid NOT NULL REFERENCES "users"("id"),
  "target_participant_id" uuid NOT NULL REFERENCES "users"("id"),
  "text" text NOT NULL,
  "status" "reply_status" DEFAULT 'pending' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crossing_replies_crossing_status_idx"
ON "crossing_replies" USING btree ("crossing_id","status");
