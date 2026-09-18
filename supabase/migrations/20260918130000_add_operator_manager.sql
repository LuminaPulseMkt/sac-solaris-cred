-- Hierarquia de gerente: qualquer operador pode ser "gerente" de outros —
-- não é um cargo separado, é só um operador apontado como responsável.
alter table public.operators
  add column manager_id uuid references public.operators(id) on delete set null;

create index if not exists operators_manager_id_idx on public.operators(manager_id);
