CREATE UNIQUE INDEX IF NOT EXISTS conversations_reply_id_unique
  ON conversations (reply_id);

CREATE UNIQUE INDEX IF NOT EXISTS crossing_drafts_active_conversation_unique
  ON crossing_drafts (conversation_id)
  WHERE status = 'draft';

CREATE UNIQUE INDEX IF NOT EXISTS shift_drafts_active_conversation_unique
  ON shift_drafts (conversation_id)
  WHERE status = 'draft';
