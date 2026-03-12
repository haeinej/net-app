ALTER TABLE shift_drafts
  ADD COLUMN IF NOT EXISTS participant_a_ready_at timestamptz,
  ADD COLUMN IF NOT EXISTS participant_b_ready_at timestamptz;
