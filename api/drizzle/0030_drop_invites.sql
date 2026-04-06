DROP TABLE IF EXISTS "invite_codes";

ALTER TABLE "users"
DROP COLUMN IF EXISTS "invited_by_user_id";
