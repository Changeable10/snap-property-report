
ALTER TABLE public.listing_photos
  ADD COLUMN IF NOT EXISTS staged_url text,
  ADD COLUMN IF NOT EXISTS staging_style text;

CREATE TABLE IF NOT EXISTS public.staging_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_photo_id uuid NOT NULL REFERENCES public.listing_photos(id) ON DELETE CASCADE,
  style text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staging_usage TO authenticated;
GRANT ALL ON public.staging_usage TO service_role;

ALTER TABLE public.staging_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own staging usage"
  ON public.staging_usage FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own staging usage"
  ON public.staging_usage FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS staging_usage_user_created_idx
  ON public.staging_usage (user_id, created_at DESC);
