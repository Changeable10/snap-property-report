GRANT SELECT ON public.team_invite_tokens TO anon;

DROP POLICY IF EXISTS "Public read invite by token" ON public.team_invite_tokens;
CREATE POLICY "Public read invite by token"
  ON public.team_invite_tokens
  FOR SELECT
  TO anon, authenticated
  USING (true);