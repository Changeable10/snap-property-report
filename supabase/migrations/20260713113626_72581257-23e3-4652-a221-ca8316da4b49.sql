ALTER TABLE public.team_branding
  ADD COLUMN IF NOT EXISTS rex_api_token text,
  ADD COLUMN IF NOT EXISTS rex_connected boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rex_account_email text;