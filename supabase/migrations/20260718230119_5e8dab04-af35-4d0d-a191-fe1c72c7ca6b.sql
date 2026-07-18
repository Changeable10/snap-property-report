
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archive_reason text;

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archive_reason text;

CREATE INDEX IF NOT EXISTS properties_active_idx
  ON public.properties (user_id) WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS listings_active_idx
  ON public.listings (user_id) WHERE archived_at IS NULL;
