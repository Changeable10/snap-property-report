
-- ============ TEAMS ============
CREATE TABLE public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'agency',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teams TO authenticated;
GRANT ALL ON public.teams TO service_role;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

-- ============ TEAM MEMBERS ============
CREATE TABLE public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member')),
  invited_email text NOT NULL,
  status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited','active','removed')),
  invited_at timestamptz NOT NULL DEFAULT now(),
  joined_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX team_members_team_user_uniq ON public.team_members(team_id, user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX team_members_team_email_uniq ON public.team_members(team_id, lower(invited_email));
CREATE INDEX team_members_user_idx ON public.team_members(user_id) WHERE user_id IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_members TO authenticated;
GRANT ALL ON public.team_members TO service_role;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- ============ HELPER FUNCTIONS (SECURITY DEFINER, non-executable to end roles) ============
CREATE OR REPLACE FUNCTION public.is_team_member(_team_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.team_members
    WHERE team_id = _team_id AND user_id = _user_id AND status = 'active'
  );
$$;
REVOKE EXECUTE ON FUNCTION public.is_team_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_team_member(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.get_user_team_id(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT team_id FROM public.team_members
  WHERE user_id = _user_id AND status = 'active'
  ORDER BY joined_at ASC NULLS LAST LIMIT 1;
$$;
REVOKE EXECUTE ON FUNCTION public.get_user_team_id(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_team_id(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.has_team_role(_team_id uuid, _user_id uuid, _roles text[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.team_members
    WHERE team_id = _team_id AND user_id = _user_id AND status = 'active' AND role = ANY(_roles)
  );
$$;
REVOKE EXECUTE ON FUNCTION public.has_team_role(uuid, uuid, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_team_role(uuid, uuid, text[]) TO service_role;

-- Claim pending invites for the current user by matching email
CREATE OR REPLACE FUNCTION public.claim_team_invites()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _email text;
  _count integer;
BEGIN
  SELECT email INTO _email FROM auth.users WHERE id = auth.uid();
  IF _email IS NULL THEN RETURN 0; END IF;
  UPDATE public.team_members
    SET user_id = auth.uid(),
        status = 'active',
        joined_at = COALESCE(joined_at, now()),
        updated_at = now()
  WHERE lower(invited_email) = lower(_email) AND status = 'invited';
  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN _count;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.claim_team_invites() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_team_invites() TO authenticated;

-- ============ TEAMS POLICIES ============
CREATE POLICY "Members view their team" ON public.teams FOR SELECT
  TO authenticated
  USING (
    owner_id = auth.uid()
    OR public.is_team_member(id, auth.uid())
  );
CREATE POLICY "Users create own team" ON public.teams FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Owner updates team" ON public.teams FOR UPDATE
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Owner deletes team" ON public.teams FOR DELETE
  TO authenticated
  USING (owner_id = auth.uid());

-- ============ TEAM_MEMBERS POLICIES ============
-- Members can see the roster of teams they belong to (owner sees own team via ownership check)
CREATE POLICY "View team roster" ON public.team_members FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_id AND t.owner_id = auth.uid())
    OR public.is_team_member(team_id, auth.uid())
  );
-- Owner or admin can invite (insert)
CREATE POLICY "Owner/admin invite members" ON public.team_members FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_id AND t.owner_id = auth.uid())
    OR public.has_team_role(team_id, auth.uid(), ARRAY['admin'])
  );
-- Owner updates anyone; admin updates non-owner rows
CREATE POLICY "Manage members update" ON public.team_members FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_id AND t.owner_id = auth.uid())
    OR (public.has_team_role(team_id, auth.uid(), ARRAY['admin']) AND role <> 'owner')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_id AND t.owner_id = auth.uid())
    OR (public.has_team_role(team_id, auth.uid(), ARRAY['admin']) AND role <> 'owner')
  );
CREATE POLICY "Manage members delete" ON public.team_members FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_id AND t.owner_id = auth.uid())
    OR (public.has_team_role(team_id, auth.uid(), ARRAY['admin']) AND role <> 'owner')
  );

-- ============ ADD team_id COLUMNS ============
ALTER TABLE public.properties ADD COLUMN team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL;
ALTER TABLE public.inspections ADD COLUMN team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL;
ALTER TABLE public.listings ADD COLUMN team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL;
ALTER TABLE public.healthy_homes_assessments ADD COLUMN team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL;

CREATE INDEX properties_team_idx ON public.properties(team_id) WHERE team_id IS NOT NULL;
CREATE INDEX inspections_team_idx ON public.inspections(team_id) WHERE team_id IS NOT NULL;
CREATE INDEX listings_team_idx ON public.listings(team_id) WHERE team_id IS NOT NULL;
CREATE INDEX hh_team_idx ON public.healthy_homes_assessments(team_id) WHERE team_id IS NOT NULL;

-- ============ AUTO-SET team_id ON INSERT ============
CREATE OR REPLACE FUNCTION public.autoset_team_id()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.team_id IS NULL AND NEW.user_id IS NOT NULL THEN
    NEW.team_id := public.get_user_team_id(NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER properties_autoset_team BEFORE INSERT ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.autoset_team_id();
CREATE TRIGGER inspections_autoset_team BEFORE INSERT ON public.inspections
  FOR EACH ROW EXECUTE FUNCTION public.autoset_team_id();
CREATE TRIGGER listings_autoset_team BEFORE INSERT ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public.autoset_team_id();
CREATE TRIGGER hh_autoset_team BEFORE INSERT ON public.healthy_homes_assessments
  FOR EACH ROW EXECUTE FUNCTION public.autoset_team_id();

-- ============ UPDATE RLS POLICIES TO INCLUDE TEAM ACCESS ============
DROP POLICY "own properties" ON public.properties;
CREATE POLICY "own or team properties" ON public.properties FOR ALL
  TO authenticated
  USING (
    auth.uid() = user_id
    OR (team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid()))
  )
  WITH CHECK (
    auth.uid() = user_id
    OR (team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid()))
  );

DROP POLICY "own inspections" ON public.inspections;
CREATE POLICY "own or team inspections" ON public.inspections FOR ALL
  TO authenticated
  USING (
    auth.uid() = user_id
    OR (team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid()))
  )
  WITH CHECK (
    auth.uid() = user_id
    OR (team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid()))
  );

DROP POLICY "Users manage own listings" ON public.listings;
CREATE POLICY "own or team listings" ON public.listings FOR ALL
  TO authenticated
  USING (
    auth.uid() = user_id
    OR (team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid()))
  )
  WITH CHECK (
    auth.uid() = user_id
    OR (team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid()))
  );

DROP POLICY "Users manage their own healthy homes assessments" ON public.healthy_homes_assessments;
CREATE POLICY "own or team healthy homes assessments" ON public.healthy_homes_assessments FOR ALL
  TO authenticated
  USING (
    auth.uid() = user_id
    OR (team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid()))
  )
  WITH CHECK (
    auth.uid() = user_id
    OR (team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid()))
  );

-- ============ updated_at TRIGGERS ============
CREATE TRIGGER teams_touch BEFORE UPDATE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER team_members_touch BEFORE UPDATE ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
