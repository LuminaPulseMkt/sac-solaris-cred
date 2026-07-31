CREATE OR REPLACE FUNCTION public.close_idle_conversations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_hours integer;
  v_count integer;
BEGIN
  SELECT COALESCE(NULLIF(value, '')::integer, 8) INTO v_hours
  FROM public.app_settings
  WHERE key = 'session_idle_threshold_hours';

  IF v_hours IS NULL OR v_hours <= 0 THEN
    v_hours := 8;
  END IF;

  UPDATE public.conversations
  SET status = 'expired',
      ended_at = COALESCE(ended_at, updated_at),
      updated_at = now()
  WHERE status = 'ongoing'
    AND updated_at < now() - (v_hours || ' hours')::interval;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.unschedule('close-idle-conversations')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'close-idle-conversations');

SELECT cron.schedule(
  'close-idle-conversations',
  '*/30 * * * *',
  $$SELECT public.close_idle_conversations();$$
);