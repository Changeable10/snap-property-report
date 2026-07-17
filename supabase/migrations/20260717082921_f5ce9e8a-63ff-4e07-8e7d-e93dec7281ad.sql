
-- signature_tokens
CREATE TABLE public.signature_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  inspection_id UUID NOT NULL REFERENCES public.inspections(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '14 days'),
  used_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX signature_tokens_inspection_idx ON public.signature_tokens(inspection_id);
CREATE INDEX signature_tokens_token_idx ON public.signature_tokens(token);

GRANT SELECT, INSERT, UPDATE ON public.signature_tokens TO authenticated;
GRANT ALL ON public.signature_tokens TO service_role;

ALTER TABLE public.signature_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their inspection signature tokens"
ON public.signature_tokens FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.inspections i
    JOIN public.properties p ON p.id = i.property_id
    WHERE i.id = signature_tokens.inspection_id
      AND (p.user_id = auth.uid() OR public.is_team_member(p.team_id, auth.uid()))
  )
);

CREATE POLICY "Users create signature tokens for own inspections"
ON public.signature_tokens FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.inspections i
    JOIN public.properties p ON p.id = i.property_id
    WHERE i.id = signature_tokens.inspection_id
      AND (p.user_id = auth.uid() OR public.is_team_member(p.team_id, auth.uid()))
  )
);

-- team_invite_tokens
CREATE TABLE public.team_invite_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  invited_email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','member')),
  token TEXT NOT NULL UNIQUE,
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '14 days'),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX team_invite_tokens_team_idx ON public.team_invite_tokens(team_id);
CREATE INDEX team_invite_tokens_token_idx ON public.team_invite_tokens(token);

GRANT SELECT, INSERT, UPDATE ON public.team_invite_tokens TO authenticated;
GRANT ALL ON public.team_invite_tokens TO service_role;

ALTER TABLE public.team_invite_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team owners/admins read invite tokens"
ON public.team_invite_tokens FOR SELECT TO authenticated
USING (
  public.is_team_owner(team_id, auth.uid())
  OR public.has_team_role(team_id, auth.uid(), ARRAY['admin'])
);

CREATE POLICY "Team owners/admins create invite tokens"
ON public.team_invite_tokens FOR INSERT TO authenticated
WITH CHECK (
  invited_by = auth.uid()
  AND (
    public.is_team_owner(team_id, auth.uid())
    OR public.has_team_role(team_id, auth.uid(), ARRAY['admin'])
  )
);
