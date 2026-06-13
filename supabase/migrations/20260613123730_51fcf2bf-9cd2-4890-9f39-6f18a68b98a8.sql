
-- Drop overly permissive ALL/USING(true) policies
DROP POLICY IF EXISTS "operators app access" ON public.operators;
DROP POLICY IF EXISTS "webhook_logs app access" ON public.webhook_logs;
DROP POLICY IF EXISTS "conversations app access" ON public.conversations;
DROP POLICY IF EXISTS "messages app access" ON public.messages;

-- operators and webhook_logs: no anon/authenticated access at all.
-- All access happens server-side via service_role (which bypasses RLS).
REVOKE ALL ON public.operators FROM anon, authenticated;
REVOKE ALL ON public.webhook_logs FROM anon, authenticated;
GRANT ALL ON public.operators TO service_role;
GRANT ALL ON public.webhook_logs TO service_role;

-- conversations and messages: keep public SELECT (intentional per security memory),
-- but block writes from anon/authenticated. Writes only via service_role webhook.
GRANT SELECT ON public.conversations TO anon, authenticated;
GRANT SELECT ON public.messages TO anon, authenticated;
GRANT ALL ON public.conversations TO service_role;
GRANT ALL ON public.messages TO service_role;

CREATE POLICY "conversations public read"
  ON public.conversations
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "messages public read"
  ON public.messages
  FOR SELECT
  TO anon, authenticated
  USING (true);
