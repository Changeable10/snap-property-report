
REVOKE EXECUTE ON FUNCTION public.is_team_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_team_role(uuid, uuid, text[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_team_owner(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_team_id(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_team_member(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_team_role(uuid, uuid, text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_team_owner(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_user_team_id(uuid) TO service_role;
