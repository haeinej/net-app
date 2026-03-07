-- Phase 7: learning loop tables and thought cluster assignment
ALTER TABLE "thoughts" ADD COLUMN IF NOT EXISTS "cluster_id" uuid REFERENCES "question_clusters"("id");

CREATE TABLE IF NOT EXISTS "cross_domain_affinity" (
  "concentration_a" text NOT NULL,
  "concentration_b" text NOT NULL,
  "total_conversations" integer NOT NULL DEFAULT 0,
  "sustained_conversations" integer NOT NULL DEFAULT 0,
  "sustain_rate" real,
  "avg_depth" real,
  "updated_at" timestamp with time zone DEFAULT now(),
  PRIMARY KEY ("concentration_a", "concentration_b")
);

CREATE TABLE IF NOT EXISTS "system_config" (
  "key" text PRIMARY KEY NOT NULL,
  "value" jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "learning_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "job_type" text NOT NULL,
  "timestamp" timestamp with time zone DEFAULT now(),
  "details" jsonb
);

CREATE TABLE IF NOT EXISTS "learning_job_lock" (
  "job_type" text PRIMARY KEY NOT NULL,
  "locked_at" timestamp with time zone NOT NULL,
  "locked_by" text NOT NULL
);
