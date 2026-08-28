create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.campaigns to service_role;

create table if not exists public.campaign_sends (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  operator_id uuid references public.operators(id) on delete set null,
  lead_phone text not null,
  lead_name text,
  message_text text,
  sent_at timestamptz not null default now(),
  replied boolean not null default false,
  replied_at timestamptz,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.campaign_sends to service_role;

create index if not exists idx_campaign_sends_campaign_id on public.campaign_sends(campaign_id);
create index if not exists idx_campaign_sends_operator_id on public.campaign_sends(operator_id);
create index if not exists idx_campaign_sends_lead_phone on public.campaign_sends(lead_phone);
create index if not exists idx_campaign_sends_pending on public.campaign_sends(operator_id, lead_phone) where replied = false;
