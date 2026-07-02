-- ============================================================
-- SAC — Migration multi-tenant por schema
-- Rodar UMA VEZ no SQL Editor do Supabase:
-- https://supabase.com/dashboard/project/gkabtowunbwstgouytcl/sql/new
-- ============================================================

CREATE TABLE IF NOT EXISTS public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  schema_name text UNIQUE NOT NULL,
  logo_url text,
  plan text DEFAULT 'basic',
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenants TO authenticated;
GRANT ALL ON public.tenants TO service_role;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.tenant_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text DEFAULT 'admin',
  created_at timestamptz DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_tenant_users_user_id ON public.tenant_users(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_users TO authenticated;
GRANT ALL ON public.tenant_users TO service_role;
ALTER TABLE public.tenant_users ENABLE ROW LEVEL SECURITY;

INSERT INTO public.tenants (name, slug, schema_name)
VALUES ('Credsolaris', 'credsolaris', 'public')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.app_settings (key, value, description)
VALUES ('super_admin_emails', '[]', 'E-mails dos super admins (JSON array)')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.create_tenant_schema(schema_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF schema_name !~ '^[a-z_][a-z0-9_]*$' THEN
    RAISE EXCEPTION 'schema_name invalido: %', schema_name;
  END IF;

  EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', schema_name);

  EXECUTE format($ddl$
    CREATE TABLE IF NOT EXISTS %I.operators (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL,
      instance_name text NOT NULL,
      channel text DEFAULT 'whatsapp',
      description text,
      token text UNIQUE NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', ''),
      webhook_url text,
      status text DEFAULT 'pending',
      last_received_at timestamptz,
      messages_today int DEFAULT 0,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    )$ddl$, schema_name);

  EXECUTE format($ddl$
    CREATE TABLE IF NOT EXISTS %I.conversations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      operator_id uuid REFERENCES %I.operators(id) ON DELETE CASCADE,
      remote_jid text NOT NULL,
      lead_phone text NOT NULL,
      lead_name text,
      instance_name text NOT NULL,
      status text DEFAULT 'ongoing',
      converted boolean DEFAULT false,
      started_at timestamptz DEFAULT now(),
      ended_at timestamptz,
      session_started_at timestamptz,
      score_sac int,
      avg_response_time_s int,
      total_messages int DEFAULT 0,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    )$ddl$, schema_name, schema_name);

  EXECUTE format($ddl$
    CREATE TABLE IF NOT EXISTS %I.messages (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      conversation_id uuid REFERENCES %I.conversations(id) ON DELETE CASCADE,
      operator_id uuid REFERENCES %I.operators(id) ON DELETE CASCADE,
      from_role text NOT NULL,
      message_text text,
      message_type text DEFAULT 'text',
      transcription_status text,
      transcription_text text,
      audio_duration_s int,
      sent_at timestamptz NOT NULL,
      received_at timestamptz DEFAULT now(),
      response_time_s int,
      lead_name text,
      lead_phone text,
      raw_payload jsonb,
      created_at timestamptz DEFAULT now()
    )$ddl$, schema_name, schema_name, schema_name);

  EXECUTE format($ddl$
    CREATE TABLE IF NOT EXISTS %I.webhook_logs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      operator_id uuid REFERENCES %I.operators(id),
      received_at timestamptz DEFAULT now(),
      http_status int,
      payload_raw jsonb,
      processed boolean DEFAULT false,
      error_message text,
      origin_ip text
    )$ddl$, schema_name, schema_name);

  EXECUTE format($ddl$
    CREATE TABLE IF NOT EXISTS %I.app_settings (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      key text UNIQUE NOT NULL,
      value text DEFAULT '',
      description text,
      updated_at timestamptz DEFAULT now()
    )$ddl$, schema_name);

  EXECUTE format($ddl$
    INSERT INTO %I.app_settings (key, value, description) VALUES
      ('openai_api_key', '', 'Chave da API OpenAI'),
      ('evolution_api_url', '', 'URL da Evolution API'),
      ('evolution_api_key', '', 'API Key da Evolution'),
      ('report_whatsapp_numbers', '[]', 'Numeros para relatorios'),
      ('ai_auto_analyze', 'true', 'Analise automatica de IA'),
      ('ai_transcribe_audio', 'true', 'Transcricao de audios'),
      ('session_idle_threshold_hours', '8', 'Threshold de sessao')
    ON CONFLICT (key) DO NOTHING
  $ddl$, schema_name);

  EXECUTE format($ddl$
    CREATE TABLE IF NOT EXISTS %I.ai_analyses (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      conversation_id uuid REFERENCES %I.conversations(id) ON DELETE CASCADE,
      operator_id uuid REFERENCES %I.operators(id) ON DELETE CASCADE,
      analyzed_at timestamptz DEFAULT now(),
      ended boolean DEFAULT false,
      status_suggestion text,
      quality_score int,
      sentiment text,
      response_time_assessment text,
      conversion_likelihood text,
      summary text,
      highlights jsonb DEFAULT '[]',
      improvements jsonb DEFAULT '[]',
      topics jsonb DEFAULT '[]',
      raw_response jsonb,
      created_at timestamptz DEFAULT now()
    )$ddl$, schema_name, schema_name, schema_name);

  EXECUTE format($ddl$
    CREATE TABLE IF NOT EXISTS %I.operator_ai_metrics (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      operator_id uuid REFERENCES %I.operators(id) ON DELETE CASCADE UNIQUE,
      total_analyzed int DEFAULT 0,
      total_ended int DEFAULT 0,
      total_ongoing int DEFAULT 0,
      avg_quality_score numeric(5,2) DEFAULT 0,
      sentiment_positive int DEFAULT 0,
      sentiment_neutral int DEFAULT 0,
      sentiment_negative int DEFAULT 0,
      top_topics jsonb DEFAULT '[]',
      top_improvements jsonb DEFAULT '[]',
      last_analyzed_at timestamptz,
      updated_at timestamptz DEFAULT now()
    )$ddl$, schema_name, schema_name);

  EXECUTE format('GRANT USAGE ON SCHEMA %I TO service_role', schema_name);
  EXECUTE format('GRANT ALL ON ALL TABLES IN SCHEMA %I TO service_role', schema_name);
  EXECUTE format('GRANT ALL ON ALL SEQUENCES IN SCHEMA %I TO service_role', schema_name);
END;
$fn$;

REVOKE ALL ON FUNCTION public.create_tenant_schema(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_tenant_schema(text) TO service_role;
