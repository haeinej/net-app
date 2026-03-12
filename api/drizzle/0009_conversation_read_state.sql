ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS participant_a_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS participant_b_seen_at timestamptz;

UPDATE conversations
SET
  participant_a_seen_at = COALESCE(participant_a_seen_at, last_message_at, created_at),
  participant_b_seen_at = COALESCE(participant_b_seen_at, last_message_at, created_at);
