
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- Helpers
CREATE OR REPLACE FUNCTION public.is_team_member(_team_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.team_members WHERE team_id = _team_id AND user_id = _user_id AND status = 'active');
$$;
CREATE OR REPLACE FUNCTION public.has_team_role(_team_id uuid, _user_id uuid, _roles text[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.team_members WHERE team_id = _team_id AND user_id = _user_id AND status = 'active' AND role = ANY(_roles));
$$;
CREATE OR REPLACE FUNCTION public.is_team_owner(_team_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.teams WHERE id = _team_id AND owner_id = _user_id);
$$;

-- Grants + RLS enable for every table
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'teams','team_members','team_branding','properties','rooms',
    'inspections','inspection_items','inspection_photos','inspection_signatures',
    'comparison_results','property_contacts','subscriptions',
    'healthy_homes_assessments','listings','listing_rooms','listing_photos','staging_usage'
  ]
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated;', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role;', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
  END LOOP;
END $$;

-- teams
DROP POLICY IF EXISTS "teams_select" ON public.teams;
CREATE POLICY "teams_select" ON public.teams FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.is_team_member(id, auth.uid()));
DROP POLICY IF EXISTS "teams_insert" ON public.teams;
CREATE POLICY "teams_insert" ON public.teams FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
DROP POLICY IF EXISTS "teams_update" ON public.teams;
CREATE POLICY "teams_update" ON public.teams FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
DROP POLICY IF EXISTS "teams_delete" ON public.teams;
CREATE POLICY "teams_delete" ON public.teams FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- team_members
DROP POLICY IF EXISTS "tm_select" ON public.team_members;
CREATE POLICY "tm_select" ON public.team_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_team_owner(team_id, auth.uid()) OR public.has_team_role(team_id, auth.uid(), ARRAY['admin','owner']));
DROP POLICY IF EXISTS "tm_insert" ON public.team_members;
CREATE POLICY "tm_insert" ON public.team_members FOR INSERT TO authenticated
  WITH CHECK (public.is_team_owner(team_id, auth.uid()) OR public.has_team_role(team_id, auth.uid(), ARRAY['admin','owner']));
DROP POLICY IF EXISTS "tm_update" ON public.team_members;
CREATE POLICY "tm_update" ON public.team_members FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_team_owner(team_id, auth.uid()) OR public.has_team_role(team_id, auth.uid(), ARRAY['admin','owner']))
  WITH CHECK (user_id = auth.uid() OR public.is_team_owner(team_id, auth.uid()) OR public.has_team_role(team_id, auth.uid(), ARRAY['admin','owner']));
DROP POLICY IF EXISTS "tm_delete" ON public.team_members;
CREATE POLICY "tm_delete" ON public.team_members FOR DELETE TO authenticated
  USING (public.is_team_owner(team_id, auth.uid()) OR public.has_team_role(team_id, auth.uid(), ARRAY['admin','owner']));

-- team_branding
DROP POLICY IF EXISTS "tb_select" ON public.team_branding;
CREATE POLICY "tb_select" ON public.team_branding FOR SELECT TO authenticated
  USING (public.is_team_owner(team_id, auth.uid()) OR public.is_team_member(team_id, auth.uid()));
DROP POLICY IF EXISTS "tb_insert" ON public.team_branding;
CREATE POLICY "tb_insert" ON public.team_branding FOR INSERT TO authenticated
  WITH CHECK (public.is_team_owner(team_id, auth.uid()) OR public.has_team_role(team_id, auth.uid(), ARRAY['admin','owner']));
DROP POLICY IF EXISTS "tb_update" ON public.team_branding;
CREATE POLICY "tb_update" ON public.team_branding FOR UPDATE TO authenticated
  USING (public.is_team_owner(team_id, auth.uid()) OR public.has_team_role(team_id, auth.uid(), ARRAY['admin','owner']))
  WITH CHECK (public.is_team_owner(team_id, auth.uid()) OR public.has_team_role(team_id, auth.uid(), ARRAY['admin','owner']));
DROP POLICY IF EXISTS "tb_delete" ON public.team_branding;
CREATE POLICY "tb_delete" ON public.team_branding FOR DELETE TO authenticated USING (public.is_team_owner(team_id, auth.uid()));

-- properties
DROP POLICY IF EXISTS "properties_select" ON public.properties;
CREATE POLICY "properties_select" ON public.properties FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR (team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid())));
DROP POLICY IF EXISTS "properties_insert" ON public.properties;
CREATE POLICY "properties_insert" ON public.properties FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "properties_update" ON public.properties;
CREATE POLICY "properties_update" ON public.properties FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR (team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid())))
  WITH CHECK (user_id = auth.uid() OR (team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid())));
DROP POLICY IF EXISTS "properties_delete" ON public.properties;
CREATE POLICY "properties_delete" ON public.properties FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR (team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid())));

-- rooms
DROP POLICY IF EXISTS "rooms_all" ON public.rooms;
CREATE POLICY "rooms_all" ON public.rooms FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.properties p WHERE p.id = rooms.property_id
    AND (p.user_id = auth.uid() OR (p.team_id IS NOT NULL AND public.is_team_member(p.team_id, auth.uid())))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.properties p WHERE p.id = rooms.property_id
    AND (p.user_id = auth.uid() OR (p.team_id IS NOT NULL AND public.is_team_member(p.team_id, auth.uid())))));

-- inspections
DROP POLICY IF EXISTS "inspections_select" ON public.inspections;
CREATE POLICY "inspections_select" ON public.inspections FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.properties p WHERE p.id = inspections.property_id
    AND (p.user_id = auth.uid() OR (p.team_id IS NOT NULL AND public.is_team_member(p.team_id, auth.uid())))));
DROP POLICY IF EXISTS "inspections_insert" ON public.inspections;
CREATE POLICY "inspections_insert" ON public.inspections FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.properties p WHERE p.id = inspections.property_id
    AND (p.user_id = auth.uid() OR (p.team_id IS NOT NULL AND public.is_team_member(p.team_id, auth.uid())))));
DROP POLICY IF EXISTS "inspections_update" ON public.inspections;
CREATE POLICY "inspections_update" ON public.inspections FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.properties p WHERE p.id = inspections.property_id
    AND (p.user_id = auth.uid() OR (p.team_id IS NOT NULL AND public.is_team_member(p.team_id, auth.uid())))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.properties p WHERE p.id = inspections.property_id
    AND (p.user_id = auth.uid() OR (p.team_id IS NOT NULL AND public.is_team_member(p.team_id, auth.uid())))));
DROP POLICY IF EXISTS "inspections_delete" ON public.inspections;
CREATE POLICY "inspections_delete" ON public.inspections FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.properties p WHERE p.id = inspections.property_id
    AND (p.user_id = auth.uid() OR (p.team_id IS NOT NULL AND public.is_team_member(p.team_id, auth.uid())))));

-- inspection_items
DROP POLICY IF EXISTS "ii_all" ON public.inspection_items;
CREATE POLICY "ii_all" ON public.inspection_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.inspections i JOIN public.properties p ON p.id = i.property_id
    WHERE i.id = inspection_items.inspection_id
      AND (p.user_id = auth.uid() OR (p.team_id IS NOT NULL AND public.is_team_member(p.team_id, auth.uid())))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.inspections i JOIN public.properties p ON p.id = i.property_id
    WHERE i.id = inspection_items.inspection_id
      AND (p.user_id = auth.uid() OR (p.team_id IS NOT NULL AND public.is_team_member(p.team_id, auth.uid())))));

-- inspection_photos
DROP POLICY IF EXISTS "ip_all" ON public.inspection_photos;
CREATE POLICY "ip_all" ON public.inspection_photos FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.inspections i JOIN public.properties p ON p.id = i.property_id
    WHERE i.id = inspection_photos.inspection_id
      AND (p.user_id = auth.uid() OR (p.team_id IS NOT NULL AND public.is_team_member(p.team_id, auth.uid())))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.inspections i JOIN public.properties p ON p.id = i.property_id
    WHERE i.id = inspection_photos.inspection_id
      AND (p.user_id = auth.uid() OR (p.team_id IS NOT NULL AND public.is_team_member(p.team_id, auth.uid())))));

-- inspection_signatures
DROP POLICY IF EXISTS "is_all" ON public.inspection_signatures;
CREATE POLICY "is_all" ON public.inspection_signatures FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.inspections i JOIN public.properties p ON p.id = i.property_id
    WHERE i.id = inspection_signatures.inspection_id
      AND (p.user_id = auth.uid() OR (p.team_id IS NOT NULL AND public.is_team_member(p.team_id, auth.uid())))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.inspections i JOIN public.properties p ON p.id = i.property_id
    WHERE i.id = inspection_signatures.inspection_id
      AND (p.user_id = auth.uid() OR (p.team_id IS NOT NULL AND public.is_team_member(p.team_id, auth.uid())))));

-- comparison_results (existing schema uses inspection_id + user_id)
DROP POLICY IF EXISTS "cr_all" ON public.comparison_results;
CREATE POLICY "cr_all" ON public.comparison_results FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.inspections i JOIN public.properties p ON p.id = i.property_id
      WHERE i.id = comparison_results.inspection_id
        AND (p.user_id = auth.uid() OR (p.team_id IS NOT NULL AND public.is_team_member(p.team_id, auth.uid()))))
  )
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.inspections i JOIN public.properties p ON p.id = i.property_id
      WHERE i.id = comparison_results.inspection_id
        AND (p.user_id = auth.uid() OR (p.team_id IS NOT NULL AND public.is_team_member(p.team_id, auth.uid()))))
  );

-- property_contacts
DROP POLICY IF EXISTS "pc_all" ON public.property_contacts;
CREATE POLICY "pc_all" ON public.property_contacts FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.properties p WHERE p.id = property_contacts.property_id
    AND (p.user_id = auth.uid() OR (p.team_id IS NOT NULL AND public.is_team_member(p.team_id, auth.uid())))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.properties p WHERE p.id = property_contacts.property_id
    AND (p.user_id = auth.uid() OR (p.team_id IS NOT NULL AND public.is_team_member(p.team_id, auth.uid())))));

-- subscriptions
DROP POLICY IF EXISTS "subs_select" ON public.subscriptions;
CREATE POLICY "subs_select" ON public.subscriptions FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "subs_write" ON public.subscriptions;
CREATE POLICY "subs_write" ON public.subscriptions FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- healthy_homes_assessments
DROP POLICY IF EXISTS "hh_select" ON public.healthy_homes_assessments;
CREATE POLICY "hh_select" ON public.healthy_homes_assessments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.properties p WHERE p.id = healthy_homes_assessments.property_id
    AND (p.user_id = auth.uid() OR (p.team_id IS NOT NULL AND public.is_team_member(p.team_id, auth.uid())))));
DROP POLICY IF EXISTS "hh_insert" ON public.healthy_homes_assessments;
CREATE POLICY "hh_insert" ON public.healthy_homes_assessments FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.properties p WHERE p.id = healthy_homes_assessments.property_id
    AND (p.user_id = auth.uid() OR (p.team_id IS NOT NULL AND public.is_team_member(p.team_id, auth.uid())))));
DROP POLICY IF EXISTS "hh_update" ON public.healthy_homes_assessments;
CREATE POLICY "hh_update" ON public.healthy_homes_assessments FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.properties p WHERE p.id = healthy_homes_assessments.property_id
    AND (p.user_id = auth.uid() OR (p.team_id IS NOT NULL AND public.is_team_member(p.team_id, auth.uid())))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.properties p WHERE p.id = healthy_homes_assessments.property_id
    AND (p.user_id = auth.uid() OR (p.team_id IS NOT NULL AND public.is_team_member(p.team_id, auth.uid())))));
DROP POLICY IF EXISTS "hh_delete" ON public.healthy_homes_assessments;
CREATE POLICY "hh_delete" ON public.healthy_homes_assessments FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.properties p WHERE p.id = healthy_homes_assessments.property_id
    AND (p.user_id = auth.uid() OR (p.team_id IS NOT NULL AND public.is_team_member(p.team_id, auth.uid())))));

-- listings
DROP POLICY IF EXISTS "listings_select" ON public.listings;
CREATE POLICY "listings_select" ON public.listings FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR (team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid())));
DROP POLICY IF EXISTS "listings_insert" ON public.listings;
CREATE POLICY "listings_insert" ON public.listings FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "listings_update" ON public.listings;
CREATE POLICY "listings_update" ON public.listings FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR (team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid())))
  WITH CHECK (user_id = auth.uid() OR (team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid())));
DROP POLICY IF EXISTS "listings_delete" ON public.listings;
CREATE POLICY "listings_delete" ON public.listings FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR (team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid())));

-- listing_rooms
DROP POLICY IF EXISTS "lr_all" ON public.listing_rooms;
CREATE POLICY "lr_all" ON public.listing_rooms FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.listings l WHERE l.id = listing_rooms.listing_id
    AND (l.user_id = auth.uid() OR (l.team_id IS NOT NULL AND public.is_team_member(l.team_id, auth.uid())))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.listings l WHERE l.id = listing_rooms.listing_id
    AND (l.user_id = auth.uid() OR (l.team_id IS NOT NULL AND public.is_team_member(l.team_id, auth.uid())))));

-- listing_photos
DROP POLICY IF EXISTS "lp_all" ON public.listing_photos;
CREATE POLICY "lp_all" ON public.listing_photos FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.listings l WHERE l.id = listing_photos.listing_id
    AND (l.user_id = auth.uid() OR (l.team_id IS NOT NULL AND public.is_team_member(l.team_id, auth.uid())))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.listings l WHERE l.id = listing_photos.listing_id
    AND (l.user_id = auth.uid() OR (l.team_id IS NOT NULL AND public.is_team_member(l.team_id, auth.uid())))));

-- staging_usage
DROP POLICY IF EXISTS "su_select" ON public.staging_usage;
CREATE POLICY "su_select" ON public.staging_usage FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "su_write" ON public.staging_usage;
CREATE POLICY "su_write" ON public.staging_usage FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
