
-- 1. Remove public SELECT policy on team_invite_tokens and revoke anon table access.
DROP POLICY IF EXISTS "Public read invite by token" ON public.team_invite_tokens;
REVOKE SELECT ON public.team_invite_tokens FROM anon;

-- 2. Lock down SECURITY DEFINER helpers.
-- Revoke from PUBLIC and anon on all SECURITY DEFINER functions in public schema.
REVOKE EXECUTE ON FUNCTION public.claim_team_invites() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.autoset_team_id() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_team_owner(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_team_id(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_team_role(uuid, uuid, text[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_active_subscription(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_team_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.increment_usage(text) FROM PUBLIC, anon;

-- Trigger-only helpers: no direct callers needed.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
             WHERE n.nspname='public' AND p.proname='touch_updated_at') THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
             WHERE n.nspname='public' AND p.proname='touch_usage_tracking_updated_at') THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.touch_usage_tracking_updated_at() FROM PUBLIC, anon, authenticated';
  END IF;
END $$;

-- Ensure authenticated retains EXECUTE only where actually needed:
-- - increment_usage: client RPC
-- - RLS helpers: called from within policies as the querying user
GRANT EXECUTE ON FUNCTION public.increment_usage(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_team_owner(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_team_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_team_role(uuid, uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_active_subscription(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_team_member(uuid, uuid) TO authenticated;
