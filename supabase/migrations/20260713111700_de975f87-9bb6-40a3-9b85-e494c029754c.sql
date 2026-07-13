-- Team members can read logos in their team's folder
CREATE POLICY "team_branding_storage_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'team-branding'
    AND public.is_team_member(
      (regexp_replace(split_part(name, '/', 1), '^team-', ''))::uuid,
      auth.uid()
    )
  );

CREATE POLICY "team_branding_storage_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'team-branding'
    AND public.has_team_role(
      (regexp_replace(split_part(name, '/', 1), '^team-', ''))::uuid,
      auth.uid(),
      ARRAY['owner','admin']
    )
  );

CREATE POLICY "team_branding_storage_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'team-branding'
    AND public.has_team_role(
      (regexp_replace(split_part(name, '/', 1), '^team-', ''))::uuid,
      auth.uid(),
      ARRAY['owner','admin']
    )
  )
  WITH CHECK (
    bucket_id = 'team-branding'
    AND public.has_team_role(
      (regexp_replace(split_part(name, '/', 1), '^team-', ''))::uuid,
      auth.uid(),
      ARRAY['owner','admin']
    )
  );

CREATE POLICY "team_branding_storage_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'team-branding'
    AND public.has_team_role(
      (regexp_replace(split_part(name, '/', 1), '^team-', ''))::uuid,
      auth.uid(),
      ARRAY['owner','admin']
    )
  );