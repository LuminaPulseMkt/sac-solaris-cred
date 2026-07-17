CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE INDEX IF NOT EXISTS idx_webhook_logs_received_at ON public.webhook_logs(received_at);

CREATE OR REPLACE FUNCTION public.cleanup_webhook_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.webhook_logs
  WHERE received_at < now() - interval '24 hours';
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_webhook_logs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_webhook_logs() TO service_role;