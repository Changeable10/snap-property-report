CREATE TABLE public.team_branding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL UNIQUE REFERENCES public.teams(id) ON DELETE CASCADE,
  company_name text NOT NULL,
  logo_url text,
  phone text,
  email text,
  address text,
  brand_colour text NOT NULL DEFAULT '#0055E0',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_branding TO authenticated;
GRANT ALL ON public.team_branding TO service_role;

ALTER TABLE public.team_branding ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team_branding_select_members"
  ON public.team_branding FOR SELECT TO authenticated
  USING (public.is_team_member(team_id, auth.uid()));

CREATE POLICY "team_branding_insert_admins"
  ON public.team_branding FOR INSERT TO authenticated
  WITH CHECK (public.has_team_role(team_id, auth.uid(), ARRAY['owner','admin']));

CREATE POLICY "team_branding_update_admins"
  ON public.team_branding FOR UPDATE TO authenticated
  USING (public.has_team_role(team_id, auth.uid(), ARRAY['owner','admin']))
  WITH CHECK (public.has_team_role(team_id, auth.uid(), ARRAY['owner','admin']));

CREATE POLICY "team_branding_delete_admins"
  ON public.team_branding FOR DELETE TO authenticated
  USING (public.has_team_role(team_id, auth.uid(), ARRAY['owner','admin']));

CREATE TRIGGER team_branding_touch
  BEFORE UPDATE ON public.team_branding
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();