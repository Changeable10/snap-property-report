GRANT EXECUTE ON FUNCTION public.is_team_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_team_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_team_role(uuid, uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_team_owner(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_active_subscription(uuid, text) TO authenticated;