
-- Drop overly permissive public-read policies (server uses service_role via supabaseAdmin)
DROP POLICY IF EXISTS operators_read ON public.operators;
DROP POLICY IF EXISTS webhook_logs_read ON public.webhook_logs;
DROP POLICY IF EXISTS conversations_read ON public.conversations;
DROP POLICY IF EXISTS messages_read ON public.messages;
DROP POLICY IF EXISTS ai_analyses_read ON public.ai_analyses;

-- Tighten ai_analyses writes to service_role only
DROP POLICY IF EXISTS ai_analyses_write ON public.ai_analyses;
CREATE POLICY ai_analyses_service_all ON public.ai_analyses
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Enable RLS on operator_ai_metrics and restrict to service_role
ALTER TABLE public.operator_ai_metrics ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.operator_ai_metrics FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.operator_ai_metrics TO service_role;
DROP POLICY IF EXISTS operator_ai_metrics_service_all ON public.operator_ai_metrics;
CREATE POLICY operator_ai_metrics_service_all ON public.operator_ai_metrics
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Ensure no anon/authenticated grants linger on sensitive tables
REVOKE ALL ON public.operators FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.webhook_logs FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.conversations FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.messages FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.ai_analyses FROM anon, authenticated, PUBLIC;

GRANT ALL ON public.operators TO service_role;
GRANT ALL ON public.webhook_logs TO service_role;
GRANT ALL ON public.conversations TO service_role;
GRANT ALL ON public.messages TO service_role;
GRANT ALL ON public.ai_analyses TO service_role;
