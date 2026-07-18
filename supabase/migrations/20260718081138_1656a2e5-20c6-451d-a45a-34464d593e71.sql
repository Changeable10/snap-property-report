GRANT SELECT, INSERT ON public.staging_usage TO authenticated;
GRANT ALL ON public.staging_usage TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.listing_photos TO authenticated;
GRANT ALL ON public.listing_photos TO service_role;

DROP POLICY IF EXISTS "Users can insert own staging usage" ON public.staging_usage;
DROP POLICY IF EXISTS "Users can view own staging usage" ON public.staging_usage;
DROP POLICY IF EXISTS su_select ON public.staging_usage;
DROP POLICY IF EXISTS su_write ON public.staging_usage;
DROP POLICY IF EXISTS staging_usage_insert_own ON public.staging_usage;
DROP POLICY IF EXISTS staging_usage_select_own ON public.staging_usage;

CREATE POLICY staging_usage_insert_own
ON public.staging_usage
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY staging_usage_select_own
ON public.staging_usage
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.can_access_listing_photo_for_update(
  _listing_id uuid,
  _photo_user_id uuid,
  _photo_team_id uuid,
  _user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.listings l
    WHERE l.id = _listing_id
      AND (
        _photo_user_id = _user_id
        OR l.user_id = _user_id
        OR (_photo_team_id IS NOT NULL AND public.is_team_member(_photo_team_id, _user_id))
        OR (l.team_id IS NOT NULL AND public.is_team_member(l.team_id, _user_id))
        OR EXISTS (
          SELECT 1
          FROM public.teams t
          JOIN public.team_members caller_tm
            ON caller_tm.team_id = t.id
           AND caller_tm.user_id = _user_id
           AND caller_tm.status = 'active'
          WHERE t.owner_id = l.user_id
        )
        OR EXISTS (
          SELECT 1
          FROM public.team_members owner_tm
          JOIN public.team_members caller_tm
            ON caller_tm.team_id = owner_tm.team_id
           AND caller_tm.user_id = _user_id
           AND caller_tm.status = 'active'
          WHERE owner_tm.user_id = l.user_id
            AND owner_tm.status = 'active'
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_access_listing_photo_for_update(uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_listing_photo_for_update(uuid, uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_listing_photo_for_update(uuid, uuid, uuid, uuid) TO service_role;

DROP POLICY IF EXISTS listing_photos_update_team_access ON public.listing_photos;

CREATE POLICY listing_photos_update_team_access
ON public.listing_photos
FOR UPDATE
TO authenticated
USING (public.can_access_listing_photo_for_update(listing_id, user_id, team_id, auth.uid()))
WITH CHECK (public.can_access_listing_photo_for_update(listing_id, user_id, team_id, auth.uid()));