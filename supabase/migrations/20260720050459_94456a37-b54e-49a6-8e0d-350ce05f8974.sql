
-- Move SECURITY DEFINER helper functions out of the API-exposed public schema
-- so signed-in users cannot invoke them via PostgREST. Policies keep working
-- because policy expressions reference the function OIDs, not the schema name.

CREATE SCHEMA IF NOT EXISTS private;

-- Grant USAGE so RLS policies (executed as caller) can resolve functions
-- through OID references. PostgREST is not configured to expose this schema.
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

-- Move the helpers.
ALTER FUNCTION public.get_user_team_id(uuid) SET SCHEMA private;
ALTER FUNCTION public.has_team_role(uuid, uuid, text[]) SET SCHEMA private;
ALTER FUNCTION public.is_team_member(uuid, uuid) SET SCHEMA private;
ALTER FUNCTION public.is_team_owner(uuid, uuid) SET SCHEMA private;
ALTER FUNCTION public.has_active_subscription(uuid, text) SET SCHEMA private;

-- Fix autoset_team_id, which calls get_user_team_id unqualified.
CREATE OR REPLACE FUNCTION public.autoset_team_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $function$
BEGIN
  IF NEW.team_id IS NULL AND NEW.user_id IS NOT NULL THEN
    NEW.team_id := private.get_user_team_id(NEW.user_id);
  END IF;
  RETURN NEW;
END;
$function$;

-- Convert increment_usage (called by clients via RPC and therefore must remain
-- in public) to SECURITY INVOKER. RLS on usage_tracking already scopes rows
-- to auth.uid() for insert/update/select, so this is safe.
CREATE OR REPLACE FUNCTION public.increment_usage(_usage_type text)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid UUID := auth.uid();
  _month TEXT := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM');
  _new_count INTEGER;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _usage_type NOT IN ('listing','staging','enhancement') THEN
    RAISE EXCEPTION 'invalid usage_type: %', _usage_type;
  END IF;
  INSERT INTO public.usage_tracking (user_id, usage_type, month, count)
    VALUES (_uid, _usage_type, _month, 1)
  ON CONFLICT (user_id, usage_type, month)
    DO UPDATE SET count = public.usage_tracking.count + 1, updated_at = now()
  RETURNING count INTO _new_count;
  RETURN _new_count;
END;
$function$;
