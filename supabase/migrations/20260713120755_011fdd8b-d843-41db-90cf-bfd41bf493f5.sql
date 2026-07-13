
-- 1. Extend listing_rooms and listing_photos with team support (parity with listings/properties)
ALTER TABLE public.listing_rooms ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL;
ALTER TABLE public.listing_photos ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL;

DROP POLICY IF EXISTS "Users manage own listing_rooms" ON public.listing_rooms;
CREATE POLICY "own or team listing_rooms" ON public.listing_rooms FOR ALL
  USING ((auth.uid() = user_id) OR ((team_id IS NOT NULL) AND public.is_team_member(team_id, auth.uid())))
  WITH CHECK ((auth.uid() = user_id) OR ((team_id IS NOT NULL) AND public.is_team_member(team_id, auth.uid())));

DROP POLICY IF EXISTS "Users manage own listing_photos" ON public.listing_photos;
CREATE POLICY "own or team listing_photos" ON public.listing_photos FOR ALL
  USING ((auth.uid() = user_id) OR ((team_id IS NOT NULL) AND public.is_team_member(team_id, auth.uid())))
  WITH CHECK ((auth.uid() = user_id) OR ((team_id IS NOT NULL) AND public.is_team_member(team_id, auth.uid())));

-- 2. Admin flag table (roles must live in a separate table)
CREATE TABLE IF NOT EXISTS public.admin_users (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.admin_users TO authenticated;
GRANT ALL ON public.admin_users TO service_role;

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- Users can only read their own admin flag (no INSERT/UPDATE/DELETE from client).
CREATE POLICY "Users can check own admin flag" ON public.admin_users
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- 3. Seed Steve as admin (only known user in this project)
INSERT INTO public.admin_users (user_id)
VALUES ('e5d6a7de-abca-4892-9d2c-cefc2be5a4fc')
ON CONFLICT (user_id) DO NOTHING;
