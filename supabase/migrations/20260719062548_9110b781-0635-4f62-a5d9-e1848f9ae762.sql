-- Restrict inspection-photos bucket to image mimetypes at the storage RLS layer.
DROP POLICY IF EXISTS "inspection_photos_image_mime_only" ON storage.objects;
CREATE POLICY "inspection_photos_image_mime_only"
ON storage.objects
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id <> 'inspection-photos'
  OR lower(coalesce(metadata->>'mimetype', '')) IN (
    'image/jpeg','image/png','image/heic','image/heif','image/webp'
  )
);