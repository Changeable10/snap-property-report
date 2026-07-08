
CREATE POLICY "users read own inspection photos"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'inspection-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "users upload own inspection photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'inspection-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "users update own inspection photos"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'inspection-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "users delete own inspection photos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'inspection-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
