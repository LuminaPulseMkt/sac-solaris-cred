CREATE INDEX IF NOT EXISTS idx_messages_received_at ON public.messages(received_at);

CREATE OR REPLACE FUNCTION public.cleanup_messages()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.messages
  WHERE received_at < now() - interval '7 days';
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_messages() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_messages() TO service_role;