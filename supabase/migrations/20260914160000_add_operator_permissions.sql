-- Permissões granulares por operador: o admin decide, por operador, quais
-- páginas e ações do SAC ele pode acessar. Defaults abaixo espelham o
-- comportamento atual (antes desta feature, era tudo-ou-nada via isOperator).
create table if not exists public.operator_permissions (
  operator_id uuid primary key references public.operators(id) on delete cascade,
  can_view_dashboard boolean not null default true,
  can_view_conversas boolean not null default true,
  can_view_alertas boolean not null default true,
  can_view_relatorios boolean not null default true,
  can_view_campanhas boolean not null default false,
  can_delete_conversations boolean not null default false,
  can_view_ai_analysis boolean not null default true,
  can_send_report_email boolean not null default false,
  updated_at timestamptz not null default now()
);

-- Backfill: cria uma linha de default explícita para operadores já existentes.
insert into public.operator_permissions (operator_id)
select id from public.operators
on conflict (operator_id) do nothing;

-- Só o service_role (server functions) acessa esta tabela; sem SELECT/INSERT/
-- UPDATE/DELETE via anon/authenticated (mesmo padrão de public.operators).
revoke all on public.operator_permissions from anon, authenticated;
