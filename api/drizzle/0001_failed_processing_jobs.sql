-- Phase 3: reprocessing queue for thought dual-embedding pipeline
CREATE TABLE IF NOT EXISTS "failed_processing_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "thought_id" uuid NOT NULL REFERENCES "thoughts"("id"),
  "error" text,
  "retry_count" integer DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "failed_processing_jobs_thought_id_idx" ON "failed_processing_jobs" ("thought_id");
