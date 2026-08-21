create or replace function public.sweep_idle_analysis()
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_secret text;
begin
  select value into v_secret from public.app_settings where key = 'internal_sweep_secret';
  if v_secret is null or v_secret = '' then
    return;
  end if;
  perform net.http_post(
    url := 'https://sac.renassolnuvem.tech/api/internal/sweep-analysis',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-sweep-secret', v_secret),
    timeout_milliseconds := 120000
  );
end;
$fn$;

select cron.unschedule('sweep-idle-analysis')
where exists (select 1 from cron.job where jobname = 'sweep-idle-analysis');

select cron.schedule(
  'sweep-idle-analysis',
  '*/15 * * * *',
  $$select public.sweep_idle_analysis();$$
);
