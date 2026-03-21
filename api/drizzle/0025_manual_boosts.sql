CREATE TABLE manual_boosts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  thought_id uuid NOT NULL REFERENCES thoughts(id) ON DELETE CASCADE,
  created_by text NOT NULL,
  reason text,
  consumed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX manual_boosts_target_pending_idx
  ON manual_boosts (target_user_id)
  WHERE consumed_at IS NULL;

CREATE INDEX manual_boosts_created_idx
  ON manual_boosts (created_at DESC);
