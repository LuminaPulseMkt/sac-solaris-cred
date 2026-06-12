
-- OPERATORS
CREATE TABLE public.operators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  instance_name text NOT NULL,
  channel text NOT NULL DEFAULT 'whatsapp',
  description text,
  token text UNIQUE NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', ''),
  webhook_url text,
  status text NOT NULL DEFAULT 'pending',
  last_received_at timestamptz,
  messages_today integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.operators TO authenticated, anon;
GRANT ALL ON public.operators TO service_role;
ALTER TABLE public.operators ENABLE ROW LEVEL SECURITY;
CREATE POLICY "operators open access" ON public.operators FOR ALL USING (true) WITH CHECK (true);

-- CONVERSATIONS
CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid NOT NULL REFERENCES public.operators(id) ON DELETE CASCADE,
  remote_jid text NOT NULL,
  lead_phone text NOT NULL,
  lead_name text,
  instance_name text NOT NULL,
  status text NOT NULL DEFAULT 'ongoing',
  converted boolean NOT NULL DEFAULT false,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  score_sac integer,
  avg_response_time_s integer,
  total_messages integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operator_id, remote_jid)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated, anon;
GRANT ALL ON public.conversations TO service_role;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "conversations open access" ON public.conversations FOR ALL USING (true) WITH CHECK (true);

-- MESSAGES
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  operator_id uuid NOT NULL REFERENCES public.operators(id) ON DELETE CASCADE,
  from_role text NOT NULL,
  message_text text,
  message_type text NOT NULL DEFAULT 'text',
  sent_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  response_time_s integer,
  lead_name text,
  lead_phone text,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_conversation_id_idx ON public.messages (conversation_id, sent_at);
CREATE INDEX messages_operator_id_idx ON public.messages (operator_id, sent_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated, anon;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "messages open access" ON public.messages FOR ALL USING (true) WITH CHECK (true);

-- WEBHOOK LOGS
CREATE TABLE public.webhook_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid REFERENCES public.operators(id) ON DELETE SET NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  http_status integer,
  payload_raw jsonb,
  processed boolean NOT NULL DEFAULT false,
  error_message text,
  origin_ip text
);
CREATE INDEX webhook_logs_received_at_idx ON public.webhook_logs (received_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.webhook_logs TO authenticated, anon;
GRANT ALL ON public.webhook_logs TO service_role;
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "webhook_logs open access" ON public.webhook_logs FOR ALL USING (true) WITH CHECK (true);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.sac_set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER operators_set_updated_at BEFORE UPDATE ON public.operators
  FOR EACH ROW EXECUTE FUNCTION public.sac_set_updated_at();
CREATE TRIGGER conversations_set_updated_at BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.sac_set_updated_at();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.operators;
