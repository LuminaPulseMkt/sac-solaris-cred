-- Achado durante a auditoria de permissões de operador: setores, campaigns e
-- campaign_sends nunca tiveram RLS habilitado, então a GRANT padrão do
-- Supabase para anon/authenticated (leitura E escrita) ficava totalmente
-- ativa — qualquer pessoa com a anon key pública (embutida no bundle do
-- navegador) conseguia ler/gravar essas tabelas direto via PostgREST,
-- inclusive telefone/nome/texto de mensagem em campaign_sends, sem passar
-- pelas funções do servidor (requireAdmin etc.). Nenhum código do app usa a
-- anon key para consultar essas tabelas diretamente (tudo passa pelas server
-- functions com a service_role key, que ignora RLS), então habilitar RLS sem
-- nenhuma policy — equivalente a "sem acesso" para anon/authenticated — não
-- muda nada no funcionamento do app.
alter table public.setores enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_sends enable row level security;
