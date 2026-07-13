ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS features text,
  ADD COLUMN IF NOT EXISTS ai_generated_at timestamptz;