-- Limites de SLA configuráveis pelo admin, com notificação automática por
-- e-mail pro gerente responsável (via operators.manager_id; sem gerente
-- definido, cai nos destinatários gerais de app_settings.alert_notification_emails).
create table public.sla_rules (
  id uuid primary key default gen_random_uuid(),
  metric text not null unique check (metric in ('no_response','first_response','resolution')),
  threshold_minutes integer not null,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Dedup: garante que cada conversa só dispara e-mail uma vez por regra.
create table public.sla_notifications (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  rule_id uuid not null references public.sla_rules(id) on delete cascade,
  notified_at timestamptz not null default now(),
  unique (conversation_id, rule_id)
);

alter table public.sla_rules enable row level security;
alter table public.sla_notifications enable row level security;
revoke all on public.sla_rules from anon, authenticated;
revoke all on public.sla_notifications from anon, authenticated;

-- Regras desativadas por padrão — o admin revisa os limites no painel de
-- Configurações → SLA antes de ligar o envio automático de e-mail.
insert into public.sla_rules (metric, threshold_minutes, active) values
  ('no_response', 30, false),
  ('first_response', 15, false),
  ('resolution', 240, false);

create or replace function public.sweep_sla_breaches()
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
    url := 'https://sac.renassolnuvem.tech/api/internal/sweep-sla',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-sweep-secret', v_secret),
    timeout_milliseconds := 120000
  );
end;
$fn$;

select cron.unschedule('sweep-sla-breaches')
where exists (select 1 from cron.job where jobname = 'sweep-sla-breaches');

select cron.schedule(
  'sweep-sla-breaches',
  '*/10 * * * *',
  $$select public.sweep_sla_breaches();$$
);
