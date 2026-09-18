-- Acesso compartilhado: admin libera pra um operador (viewer) ver E
-- responder pela aba de conversas de outro operador (owner), sem virar
-- dono. Diferente de manager_id (hierarquia) e diferente da transferência
-- pontual (que muda o dono de verdade).
create table public.conversation_share_grants (
  id uuid primary key default gen_random_uuid(),
  owner_operator_id uuid not null references public.operators(id) on delete cascade,
  viewer_operator_id uuid not null references public.operators(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (owner_operator_id, viewer_operator_id),
  check (owner_operator_id <> viewer_operator_id)
);

alter table public.conversation_share_grants enable row level security;
revoke all on public.conversation_share_grants from anon, authenticated;
