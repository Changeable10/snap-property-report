DROP POLICY IF EXISTS listing_photos_update_team_access ON public.listing_photos;
DROP FUNCTION IF EXISTS public.can_access_listing_photo_for_update(uuid, uuid, uuid, uuid);

CREATE POLICY listing_photos_update_team_access
ON public.listing_photos
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.listings l
    WHERE l.id = listing_photos.listing_id
      AND (
        listing_photos.user_id = auth.uid()
        OR l.user_id = auth.uid()
        OR (listing_photos.team_id IS NOT NULL AND public.is_team_member(listing_photos.team_id, auth.uid()))
        OR (l.team_id IS NOT NULL AND public.is_team_member(l.team_id, auth.uid()))
        OR public.get_user_team_id(l.user_id) = public.get_user_team_id(auth.uid())
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.listings l
    WHERE l.id = listing_photos.listing_id
      AND (
        listing_photos.user_id = auth.uid()
        OR l.user_id = auth.uid()
        OR (listing_photos.team_id IS NOT NULL AND public.is_team_member(listing_photos.team_id, auth.uid()))
        OR (l.team_id IS NOT NULL AND public.is_team_member(l.team_id, auth.uid()))
        OR public.get_user_team_id(l.user_id) = public.get_user_team_id(auth.uid())
      )
  )
);