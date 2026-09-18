-- Números internos (ramais, testes, etc.) que não devem virar conversa —
-- filtrados direto na ingestão do webhook, então nunca entram em IA, KPIs,
-- relatórios ou dashboard.
create table public.blacklisted_numbers (
  id uuid primary key default gen_random_uuid(),
  phone_number text not null unique,
  label text,
  created_at timestamptz not null default now()
);

alter table public.blacklisted_numbers enable row level security;
revoke all on public.blacklisted_numbers from anon, authenticated;
