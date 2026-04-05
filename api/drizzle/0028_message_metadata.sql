-- Add metadata jsonb column to messages for thought context on merged replies
ALTER TABLE "messages" ADD COLUMN "metadata" jsonb;
