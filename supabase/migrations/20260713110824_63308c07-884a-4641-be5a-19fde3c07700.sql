
REVOKE EXECUTE ON FUNCTION public.autoset_team_id() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.autoset_team_id() TO service_role;

REVOKE EXECUTE ON FUNCTION public.claim_team_invites() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_team_invites() TO service_role;
