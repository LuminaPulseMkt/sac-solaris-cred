-- SLA por setor, com horário comercial próprio e alerta via WhatsApp.
-- Substitui o sistema de SLA global por e-mail (sla_rules/sla_notifications),
-- que fica desativado mas preservado (histórico, sem perda de dados).

-- 1) Setores ganham SLA + horário comercial + número de WhatsApp para alerta.
alter table public.setores
  add column if not exists sla_minutes integer,
  add column if not exists business_days text not null default '1,2,3,4,5',
  add column if not exists business_start_minutes integer not null default 480,
  add column if not exists business_end_minutes integer not null default 1200,
  add column if not exists business_timezone text not null default 'America/Sao_Paulo',
  add column if not exists alert_whatsapp_number text;

-- 2) Histórico de alterações de configuração do setor (quem, quando, de->para).
create table if not exists public.setor_config_history (
  id uuid primary key default gen_random_uuid(),
  setor_id uuid not null references public.setores(id) on delete cascade,
  changed_by_user_id uuid,
  changed_by_label text,
  field text not null,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);
alter table public.setor_config_history enable row level security;
revoke all on public.setor_config_history from anon, authenticated;
grant select, insert on public.setor_config_history to service_role;
create index if not exists idx_setor_config_history_setor_id on public.setor_config_history(setor_id, created_at desc);

-- 3) Fila/dedup de alertas de estouro de SLA por setor — "pending" quando
--    estoura fora do expediente (fica esperando o próximo horário comercial
--    do setor), "sent" quando o WhatsApp já saiu.
create table if not exists public.setor_sla_alerts (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  setor_id uuid not null references public.setores(id) on delete cascade,
  breached_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'sent')),
  sent_at timestamptz,
  unique (conversation_id)
);
alter table public.setor_sla_alerts enable row level security;
revoke all on public.setor_sla_alerts from anon, authenticated;
grant select, insert, update on public.setor_sla_alerts to service_role;
create index if not exists idx_setor_sla_alerts_status on public.setor_sla_alerts(status);

-- 4) Quando a conversa foi atribuída ao setor atual (abertura ou
--    transferência) — é o instante em que o relógio do SLA do setor começa.
alter table public.conversations add column if not exists setor_assigned_at timestamptz;
update public.conversations set setor_assigned_at = coalesce(started_at, created_at) where setor_assigned_at is null;

create or replace function public.set_conversation_setor_assigned_at()
returns trigger
language plpgsql
as $fn$
declare
  v_old_setor uuid;
  v_new_setor uuid;
begin
  if TG_OP = 'INSERT' then
    new.setor_assigned_at := coalesce(new.started_at, now());
    return new;
  end if;

  if new.operator_id is distinct from old.operator_id then
    select setor_id into v_old_setor from public.operators where id = old.operator_id;
    select setor_id into v_new_setor from public.operators where id = new.operator_id;
    if v_new_setor is distinct from v_old_setor then
      new.setor_assigned_at := now();
    end if;
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_conversation_setor_assigned_at on public.conversations;
create trigger trg_conversation_setor_assigned_at
before insert or update of operator_id on public.conversations
for each row execute function public.set_conversation_setor_assigned_at();

-- 5) Desativa o SLA global antigo (por e-mail) — dados preservados.
update public.sla_rules set active = false;
select cron.unschedule('sweep-sla-breaches')
where exists (select 1 from cron.job where jobname = 'sweep-sla-breaches');

-- 6) Novo sweep: SLA por setor, considerando horário comercial, a cada 10 min.
create or replace function public.sweep_sector_sla_breaches()
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
    url := 'https://sac.renassolnuvem.tech/api/internal/sweep-sector-sla',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-sweep-secret', v_secret),
    timeout_milliseconds := 120000
  );
end;
$fn$;

select cron.unschedule('sweep-sector-sla-breaches')
where exists (select 1 from cron.job where jobname = 'sweep-sector-sla-breaches');

select cron.schedule(
  'sweep-sector-sla-breaches',
  '*/10 * * * *',
  $$select public.sweep_sector_sla_breaches();$$
);
