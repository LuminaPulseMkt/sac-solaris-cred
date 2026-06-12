GRANT ALL ON public.conversations TO service_role;
GRANT ALL ON public.messages TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated, anon;

DROP POLICY IF EXISTS "conversations public read" ON public.conversations;
DROP POLICY IF EXISTS "messages public read" ON public.messages;

CREATE POLICY "conversations app access" ON public.conversations
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "messages app access" ON public.messages
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);