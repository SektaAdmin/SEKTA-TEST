-- Bucket 'receipts' для збереження PNG квитанцій (public=true)
-- Виконується після створення bucket через Supabase Dashboard або MCP

-- RLS policy: authenticated може завантажувати
CREATE POLICY "receipts_authenticated_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'receipts');

-- RLS policy: публічне читання
CREATE POLICY "receipts_public_select"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'receipts');
