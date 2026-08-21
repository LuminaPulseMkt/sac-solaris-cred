create table if not exists public.setores (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.setores to service_role;

alter table public.operators add column if not exists setor_id uuid references public.setores(id) on delete set null;
create index if not exists idx_operators_setor_id on public.operators(setor_id);
