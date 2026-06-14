GRANT ALL ON TABLE public.operators TO service_role;
GRANT ALL ON TABLE public.webhook_logs TO service_role;
GRANT ALL ON TABLE public.conversations TO service_role;
GRANT ALL ON TABLE public.messages TO service_role;

GRANT SELECT ON TABLE public.conversations TO anon, authenticated;
GRANT SELECT ON TABLE public.messages TO anon, authenticated;

GRANT SELECT ON TABLE public.operators TO anon, authenticated;
GRANT SELECT ON TABLE public.webhook_logs TO anon, authenticated;

ALTER TABLE public.operators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "operators public read" ON public.operators;
CREATE POLICY "operators public read"
ON public.operators
FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "webhook logs public read" ON public.webhook_logs;
CREATE POLICY "webhook logs public read"
ON public.webhook_logs
FOR SELECT
TO anon, authenticated
USING (true);