-- Prevent creating multiple personal sessions for same user/time
BEGIN;

-- Partial unique index: one personal session per user per date/time
CREATE UNIQUE INDEX IF NOT EXISTS ux_personal_session_per_user_time
ON class_sessions (personal_user_id, schedule_date, schedule_time)
WHERE personal_user_id IS NOT NULL;

COMMIT;
