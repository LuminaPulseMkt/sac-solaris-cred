
-- Drop overly permissive policies
DROP POLICY IF EXISTS "operators open access" ON public.operators;
DROP POLICY IF EXISTS "conversations open access" ON public.conversations;
DROP POLICY IF EXISTS "messages open access" ON public.messages;
DROP POLICY IF EXISTS "webhook_logs open access" ON public.webhook_logs;

-- Lock down operators and webhook_logs: server (service_role) only
REVOKE ALL ON public.operators FROM anon, authenticated;
REVOKE ALL ON public.webhook_logs FROM anon, authenticated;

-- Conversations & messages: allow public read (used by app), writes via server only
REVOKE INSERT, UPDATE, DELETE ON public.conversations FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.messages FROM anon, authenticated;
GRANT SELECT ON public.conversations TO anon, authenticated;
GRANT SELECT ON public.messages TO anon, authenticated;

CREATE POLICY "conversations public read" ON public.conversations
  FOR SELECT USING (true);
CREATE POLICY "messages public read" ON public.messages
  FOR SELECT USING (true);

-- Legacy/unused tables: ensure no public exposure
REVOKE ALL ON public.n8n_chat_histories FROM anon, authenticated;
REVOKE ALL ON public.n8n_historico_mensagens FROM anon, authenticated;
REVOKE ALL ON public.secretaria FROM anon, authenticated;

-- Remove operators/webhook_logs from realtime (no client subscribes to them)
ALTER PUBLICATION supabase_realtime DROP TABLE public.operators;

-- Restrict the internal SECURITY DEFINER maintenance function
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
