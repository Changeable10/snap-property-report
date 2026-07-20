
DO $$ BEGIN
  CREATE TYPE public.photo_state AS ENUM ('raw','enhanced','staged','colour_adjusted');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.inspection_photos
  ADD COLUMN IF NOT EXISTS photo_state public.photo_state NOT NULL DEFAULT 'raw',
  ADD COLUMN IF NOT EXISTS adjustments jsonb;

ALTER TABLE public.listing_photos
  ADD COLUMN IF NOT EXISTS photo_state public.photo_state NOT NULL DEFAULT 'raw',
  ADD COLUMN IF NOT EXISTS adjustments jsonb;

-- Backfill existing rows so staged photos correctly reflect state
UPDATE public.inspection_photos SET photo_state = 'enhanced'
  WHERE photo_state = 'raw' AND enhanced_url IS NOT NULL;
UPDATE public.listing_photos SET photo_state = 'staged'
  WHERE photo_state = 'raw' AND staged_url IS NOT NULL;
UPDATE public.listing_photos SET photo_state = 'enhanced'
  WHERE photo_state = 'raw' AND enhanced_url IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inspection_photos_state ON public.inspection_photos(photo_state);
CREATE INDEX IF NOT EXISTS idx_listing_photos_state ON public.listing_photos(photo_state);
