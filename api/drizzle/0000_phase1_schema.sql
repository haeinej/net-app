-- Phase 1: net. recommendation engine schema (PostgreSQL + pgvector)
-- Run this migration with: npm run db:migrate (or your migration runner)

-- Enable pgvector for embedding similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- Enums
CREATE TYPE "reply_status" AS ENUM ('pending', 'accepted', 'deleted');
CREATE TYPE "engagement_event_type" AS ENUM ('view_p1', 'swipe_p2', 'swipe_p3', 'type_start', 'reply_sent');

-- 1. users
CREATE TABLE IF NOT EXISTS "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text,
  "photo_url" text,
  "cohort_year" integer,
  "current_city" text,
  "concentration" text,
  "interests" text[],
  "created_at" timestamp with time zone DEFAULT now()
);

-- 2. thoughts
CREATE TABLE IF NOT EXISTS "thoughts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "sentence" text NOT NULL,
  "context" text,
  "image_url" text,
  "surface_embedding" vector(768),
  "question_embedding" vector(768),
  "quality_score" real,
  "created_at" timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "thoughts_user_created_idx" ON "thoughts" ("user_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "thoughts_surface_embedding_hnsw" ON "thoughts" USING hnsw ("surface_embedding" vector_cosine_ops);
CREATE INDEX IF NOT EXISTS "thoughts_question_embedding_hnsw" ON "thoughts" USING hnsw ("question_embedding" vector_cosine_ops);

-- 3. replies
CREATE TABLE IF NOT EXISTS "replies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "thought_id" uuid NOT NULL REFERENCES "thoughts"("id"),
  "replier_id" uuid NOT NULL REFERENCES "users"("id"),
  "text" text NOT NULL,
  "status" "reply_status" NOT NULL DEFAULT 'pending',
  "created_at" timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "replies_thought_status_idx" ON "replies" ("thought_id", "status");

-- 4. conversations
CREATE TABLE IF NOT EXISTS "conversations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "thought_id" uuid NOT NULL REFERENCES "thoughts"("id"),
  "reply_id" uuid NOT NULL REFERENCES "replies"("id"),
  "participant_a" uuid NOT NULL REFERENCES "users"("id"),
  "participant_b" uuid NOT NULL REFERENCES "users"("id"),
  "message_count" integer DEFAULT 0,
  "last_message_at" timestamp with time zone,
  "is_dormant" boolean DEFAULT false,
  "created_at" timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "conversations_participant_a_idx" ON "conversations" ("participant_a");
CREATE INDEX IF NOT EXISTS "conversations_participant_b_idx" ON "conversations" ("participant_b");
CREATE INDEX IF NOT EXISTS "conversations_last_message_at_idx" ON "conversations" ("last_message_at" DESC);

-- 5. messages
CREATE TABLE IF NOT EXISTS "messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL REFERENCES "conversations"("id"),
  "sender_id" uuid NOT NULL REFERENCES "users"("id"),
  "text" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "messages_conversation_created_idx" ON "messages" ("conversation_id", "created_at");

-- 6. engagement_events
CREATE TABLE IF NOT EXISTS "engagement_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "thought_id" uuid NOT NULL REFERENCES "thoughts"("id"),
  "event_type" "engagement_event_type" NOT NULL,
  "session_id" text,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "engagement_events_user_thought_type_idx" ON "engagement_events" ("user_id", "thought_id", "event_type");

-- 7. question_clusters (populated later, not on launch)
CREATE TABLE IF NOT EXISTS "question_clusters" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "centroid_embedding" vector(768),
  "label" text,
  "sample_questions" text[],
  "thought_count" integer,
  "created_at" timestamp with time zone DEFAULT now()
);

-- 8. cross_cluster_affinity (populated later)
CREATE TABLE IF NOT EXISTS "cross_cluster_affinity" (
  "cluster_a_id" uuid NOT NULL REFERENCES "question_clusters"("id"),
  "cluster_b_id" uuid NOT NULL REFERENCES "question_clusters"("id"),
  "reply_rate" real,
  "conversation_rate" real,
  "sustain_rate" real,
  "avg_conversation_depth" real,
  PRIMARY KEY ("cluster_a_id", "cluster_b_id")
);

-- 9. user_recommendation_weights (populated by learning loop)
CREATE TABLE IF NOT EXISTS "user_recommendation_weights" (
  "user_id" uuid PRIMARY KEY REFERENCES "users"("id"),
  "q_weight" real DEFAULT 0.4,
  "d_weight" real DEFAULT 0.25,
  "f_weight" real DEFAULT 0.2,
  "r_weight" real DEFAULT 0.15,
  "alpha" real DEFAULT 0.3,
  "updated_at" timestamp with time zone DEFAULT now()
);
