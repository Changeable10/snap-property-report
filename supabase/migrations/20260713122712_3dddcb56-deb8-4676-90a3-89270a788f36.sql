
DO $$
DECLARE
  t text;
  tables text[] := ARRAY['properties','inspections','listings','listing_rooms','listing_photos','healthy_homes_assessments'];
  pol record;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
    END LOOP;
  END LOOP;
END $$;

-- Helper predicate reused via inline SQL
-- SELECT / UPDATE / DELETE USING: owner OR active team member
-- INSERT / UPDATE WITH CHECK: user_id = auth.uid() OR active team member of team_id

-- properties
CREATE POLICY "properties_select" ON public.properties FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR (team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid())));
CREATE POLICY "properties_insert" ON public.properties FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR (team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid())));
CREATE POLICY "properties_update" ON public.properties FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR (team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid())))
  WITH CHECK (user_id = auth.uid() OR (team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid())));
CREATE POLICY "properties_delete" ON public.properties FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR (team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid())));

-- inspections
CREATE POLICY "inspections_select" ON public.inspections FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR (team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid())));
CREATE POLICY "inspections_insert" ON public.inspections FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR (team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid())));
CREATE POLICY "inspections_update" ON public.inspections FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR (team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid())))
  WITH CHECK (user_id = auth.uid() OR (team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid())));
CREATE POLICY "inspections_delete" ON public.inspections FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR (team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid())));

-- listings
CREATE POLICY "listings_select" ON public.listings FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR (team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid())));
CREATE POLICY "listings_insert" ON public.listings FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR (team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid())));
CREATE POLICY "listings_update" ON public.listings FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR (team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid())))
  WITH CHECK (user_id = auth.uid() OR (team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid())));
CREATE POLICY "listings_delete" ON public.listings FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR (team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid())));

-- listing_rooms
CREATE POLICY "listing_rooms_select" ON public.listing_rooms FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR (team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid())));
CREATE POLICY "listing_rooms_insert" ON public.listing_rooms FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR (team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid())));
CREATE POLICY "listing_rooms_update" ON public.listing_rooms FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR (team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid())))
  WITH CHECK (user_id = auth.uid() OR (team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid())));
CREATE POLICY "listing_rooms_delete" ON public.listing_rooms FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR (team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid())));

-- listing_photos
CREATE POLICY "listing_photos_select" ON public.listing_photos FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR (team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid())));
CREATE POLICY "listing_photos_insert" ON public.listing_photos FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR (team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid())));
CREATE POLICY "listing_photos_update" ON public.listing_photos FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR (team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid())))
  WITH CHECK (user_id = auth.uid() OR (team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid())));
CREATE POLICY "listing_photos_delete" ON public.listing_photos FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR (team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid())));

-- healthy_homes_assessments
CREATE POLICY "hh_select" ON public.healthy_homes_assessments FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR (team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid())));
CREATE POLICY "hh_insert" ON public.healthy_homes_assessments FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR (team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid())));
CREATE POLICY "hh_update" ON public.healthy_homes_assessments FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR (team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid())))
  WITH CHECK (user_id = auth.uid() OR (team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid())));
CREATE POLICY "hh_delete" ON public.healthy_homes_assessments FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR (team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid())));
