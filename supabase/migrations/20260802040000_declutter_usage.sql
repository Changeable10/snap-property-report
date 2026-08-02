-- Declutter ("Clean up") shares the same monthly Decor8 budget as virtual
-- staging — see supabase/functions/declutter-listing-photo and the staging
-- gate in supabase/functions/_shared/plan.ts's requireMonthlyLimit call,
-- which both now check/increment against the existing staging_usage table.
-- This column just caches the object-removal result so "Stage" can skip
-- re-decluttering a photo that's already been cleaned up.
ALTER TABLE public.listing_photos
  ADD COLUMN IF NOT EXISTS decluttered_url text;
