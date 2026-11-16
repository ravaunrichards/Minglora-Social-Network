BEGIN;

DROP POLICY IF EXISTS "minglora-sounds_insert_owner" ON storage.objects;
CREATE POLICY "minglora-sounds_insert_owner"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'minglora-sounds'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
);

DROP POLICY IF EXISTS "minglora-sounds_read_owner" ON storage.objects;
CREATE POLICY "minglora-sounds_read_owner"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'minglora-sounds'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
);

DROP POLICY IF EXISTS "minglora-sounds_update_owner" ON storage.objects;
CREATE POLICY "minglora-sounds_update_owner"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'minglora-sounds'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
)
WITH CHECK (
  bucket_id = 'minglora-sounds'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
);

DROP POLICY IF EXISTS "minglora-sounds_delete_owner" ON storage.objects;
CREATE POLICY "minglora-sounds_delete_owner"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'minglora-sounds'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
);

COMMIT;
