-- Reports & Blocks for App Store Guideline 1.2 compliance
-- Adds user content reporting, user blocking, and moderation support

-- Enums
CREATE TYPE report_reason AS ENUM (
  'harassment',
  'hate_speech',
  'spam',
  'sexual_content',
  'violence',
  'self_harm',
  'other'
);

CREATE TYPE report_status AS ENUM (
  'pending',
  'reviewed',
  'actioned',
  'dismissed'
);

CREATE TYPE report_target_type AS ENUM (
  'thought',
  'reply',
  'crossing',
  'crossing_reply',
  'message',
  'user'
);

-- Reports table
CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES users(id),
  target_type report_target_type NOT NULL,
  target_id UUID NOT NULL,
  target_user_id UUID REFERENCES users(id),
  reason report_reason NOT NULL,
  description TEXT,
  status report_status NOT NULL DEFAULT 'pending',
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX reports_reporter_idx ON reports(reporter_id);
CREATE INDEX reports_target_idx ON reports(target_type, target_id);
CREATE INDEX reports_status_idx ON reports(status, created_at DESC);

-- Blocks table
CREATE TABLE blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id UUID NOT NULL REFERENCES users(id),
  blocked_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX blocks_pair_unique ON blocks(blocker_id, blocked_id);
CREATE INDEX blocks_blocker_idx ON blocks(blocker_id);
CREATE INDEX blocks_blocked_idx ON blocks(blocked_id);
