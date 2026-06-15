
ALTER TABLE public.n8n_chat_histories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.n8n_historico_mensagens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.secretaria ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.n8n_chat_histories FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.n8n_historico_mensagens FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.secretaria FROM anon, authenticated, PUBLIC;

REVOKE ALL ON SEQUENCE public.n8n_chat_histories_id_seq FROM anon, authenticated, PUBLIC;
REVOKE ALL ON SEQUENCE public.n8n_historico_mensagens_id_seq FROM anon, authenticated, PUBLIC;

GRANT ALL ON public.n8n_chat_histories TO service_role;
GRANT ALL ON public.n8n_historico_mensagens TO service_role;
GRANT ALL ON public.secretaria TO service_role;
