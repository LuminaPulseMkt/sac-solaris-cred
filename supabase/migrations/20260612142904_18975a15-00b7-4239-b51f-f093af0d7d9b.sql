GRANT SELECT, INSERT, UPDATE, DELETE ON public.operators TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.webhook_logs TO anon, authenticated;

DROP POLICY IF EXISTS "operators app access" ON public.operators;
CREATE POLICY "operators app access"
ON public.operators
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "webhook_logs app access" ON public.webhook_logs;
CREATE POLICY "webhook_logs app access"
ON public.webhook_logs
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);