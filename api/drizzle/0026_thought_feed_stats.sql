CREATE TABLE IF NOT EXISTS thought_feed_stats (
  thought_id uuid PRIMARY KEY REFERENCES thoughts(id) ON DELETE CASCADE,
  accepted_reply_count integer NOT NULL DEFAULT 0,
  cross_domain_accepted_reply_count integer NOT NULL DEFAULT 0,
  sustained_conversation_count integer NOT NULL DEFAULT 0,
  max_conversation_depth integer NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);
