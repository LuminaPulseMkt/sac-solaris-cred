-- Permissões de gestão delegada: além de ver páginas/ações da própria conta,
-- o admin agora pode liberar para um operador administrar TODOS os
-- operadores, setores, ou o login/acesso de qualquer operador (equivalente a
-- um admin delegado nessas áreas). Default false — precisa ser concedida
-- explicitamente, nada muda para quem já existe.
alter table public.operator_permissions
  add column if not exists can_manage_operators boolean not null default false,
  add column if not exists can_manage_setores boolean not null default false,
  add column if not exists can_manage_access boolean not null default false;
