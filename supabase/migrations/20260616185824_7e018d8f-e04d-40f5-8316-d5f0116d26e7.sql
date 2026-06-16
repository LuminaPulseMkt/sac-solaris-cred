-- Lock down operators: remove public read, enable RLS, no anon/authenticated access
DROP POLICY IF EXISTS "operators public read" ON public.operators;
ALTER TABLE public.operators ENABLE ROW LEVEL SECURITY;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.operators FROM anon, authenticated;
GRANT ALL ON public.operators TO service_role;

-- Lock down webhook_logs: remove public read, enable RLS, service role only
DROP POLICY IF EXISTS "webhook logs public read" ON public.webhook_logs;
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.webhook_logs FROM anon, authenticated;
GRANT ALL ON public.webhook_logs TO service_role;

-- Enable RLS on conversations and messages so Realtime enforces row filtering.
-- The existing permissive SELECT policies remain so the browser UI keeps working.
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;