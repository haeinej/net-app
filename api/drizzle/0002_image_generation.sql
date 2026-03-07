-- Phase 4: image_metadata on thoughts, job_type on failed_processing_jobs, image_generations for daily cap
ALTER TABLE "thoughts" ADD COLUMN IF NOT EXISTS "image_metadata" jsonb;

ALTER TABLE "failed_processing_jobs" ADD COLUMN IF NOT EXISTS "job_type" text DEFAULT 'embedding';

CREATE TABLE IF NOT EXISTS "image_generations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "thought_id" uuid REFERENCES "thoughts"("id"),
  "created_at" timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "image_generations_user_created_idx" ON "image_generations" ("user_id", "created_at");
