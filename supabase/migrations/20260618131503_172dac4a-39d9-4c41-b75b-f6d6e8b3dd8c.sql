
-- Lock down operators (contains webhook tokens) — server-only via supabaseAdmin
DROP POLICY IF EXISTS "operators read" ON public.operators;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.operators FROM anon, authenticated;
GRANT ALL ON public.operators TO service_role;

-- Lock down webhook_logs (contains raw payloads, IPs) — server-only via supabaseAdmin
DROP POLICY IF EXISTS "webhook_logs read" ON public.webhook_logs;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.webhook_logs FROM anon, authenticated;
GRANT ALL ON public.webhook_logs TO service_role;

-- Revoke EXECUTE on SECURITY DEFINER / trigger functions from API roles.
-- These are internal trigger / event-trigger helpers and must not be callable via PostgREST.
REVOKE EXECUTE ON FUNCTION public.sac_set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
