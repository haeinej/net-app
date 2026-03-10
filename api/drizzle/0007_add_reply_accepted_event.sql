-- Add reply_accepted to engagement_event_type enum
-- Note: ALTER TYPE ... ADD VALUE cannot run inside a transaction.
-- Run this migration directly via psql if the Drizzle migrator wraps in transactions.
ALTER TYPE "engagement_event_type" ADD VALUE IF NOT EXISTS 'reply_accepted';
