
create table if not exists public.operator_ai_metrics (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid references public.operators(id) on delete cascade not null,
  total_analyzed int default 0,
  total_ended int default 0,
  total_ongoing int default 0,
  avg_quality_score numeric(5,2) default 0,
  sentiment_positive int default 0,
  sentiment_neutral int default 0,
  sentiment_negative int default 0,
  top_topics jsonb default '[]'::jsonb,
  top_improvements jsonb default '[]'::jsonb,
  last_analyzed_at timestamptz,
  updated_at timestamptz default now(),
  unique (operator_id)
);

grant select, insert, update, delete on public.operator_ai_metrics to anon, authenticated;
grant all on public.operator_ai_metrics to service_role;

alter table public.operator_ai_metrics disable row level security;
