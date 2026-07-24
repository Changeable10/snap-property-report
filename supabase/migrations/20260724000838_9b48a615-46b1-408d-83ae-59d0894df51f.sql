-- Tracks which users have already received the "still setting up" nudge
-- email, so send-nudge-emails only ever sends once per user. Only touched
-- by the edge function via the service role — no client access needed.
CREATE TABLE IF NOT EXISTS public.nudge_emails_sent (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  sent_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.nudge_emails_sent ENABLE ROW LEVEL SECURITY;
