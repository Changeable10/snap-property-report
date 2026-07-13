
CREATE TYPE public.listing_type AS ENUM ('for_sale','for_rent','holiday','development');
CREATE TYPE public.listing_portal AS ENUM ('trademe','realestate','general','airbnb');
CREATE TYPE public.listing_status AS ENUM ('draft','published');
CREATE TYPE public.listing_photo_source AS ENUM ('photo','video_frame');

CREATE TABLE public.listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_type public.listing_type NOT NULL,
  target_portal public.listing_portal NOT NULL,
  title text,
  asking_price text,
  key_features text,
  bedrooms integer,
  bathrooms integer,
  status public.listing_status NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.listings TO authenticated;
GRANT ALL ON public.listings TO service_role;
ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own listings" ON public.listings FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.listing_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transcript text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(listing_id, room_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.listing_rooms TO authenticated;
GRANT ALL ON public.listing_rooms TO service_role;
ALTER TABLE public.listing_rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own listing_rooms" ON public.listing_rooms FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.listing_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  room_id uuid REFERENCES public.rooms(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  photo_url text NOT NULL,
  source public.listing_photo_source NOT NULL DEFAULT 'photo',
  captured_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.listing_photos TO authenticated;
GRANT ALL ON public.listing_photos TO service_role;
ALTER TABLE public.listing_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own listing_photos" ON public.listing_photos FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_listings_updated BEFORE UPDATE ON public.listings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_listing_rooms_updated BEFORE UPDATE ON public.listing_rooms FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_listings_user_created ON public.listings(user_id, created_at DESC);
CREATE INDEX idx_listing_rooms_listing ON public.listing_rooms(listing_id);
CREATE INDEX idx_listing_photos_listing ON public.listing_photos(listing_id);
