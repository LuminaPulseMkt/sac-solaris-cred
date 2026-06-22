CREATE TABLE IF NOT EXISTS public.app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.app_settings TO service_role;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_app_settings_updated_at ON public.app_settings;
CREATE TRIGGER set_app_settings_updated_at
BEFORE UPDATE ON public.app_settings
FOR EACH ROW
EXECUTE FUNCTION public.sac_set_updated_at();

INSERT INTO public.app_settings (key, value, description) VALUES
  ('openai_api_key', '', 'Chave da API OpenAI (sk-...)'),
  ('evolution_api_url', '', 'URL base da Evolution API'),
  ('evolution_api_key', '', 'API Key da Evolution API'),
  ('report_evolution_instance', '', 'Instância Evolution usada para envio de relatórios'),
  ('report_whatsapp_numbers', '[]', 'Números para envio de relatório em JSON'),
  ('report_schedule', 'manual', 'Frequência: manual | daily | weekly'),
  ('report_schedule_time', '08:00', 'Horário do envio automático'),
  ('report_include_ai', 'true', 'Incluir análise de IA no PDF'),
  ('report_include_table', 'true', 'Incluir tabela de conversas no PDF'),
  ('ai_auto_analyze', 'true', 'Analisar conversas automaticamente com IA')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.ai_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  operator_id UUID REFERENCES public.operators(id) ON DELETE CASCADE,
  analyzed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT CHECK (status IN ('resolved', 'ongoing', 'escalated')),
  ended BOOLEAN NOT NULL DEFAULT false,
  quality_score INTEGER CHECK (quality_score >= 0 AND quality_score <= 100),
  sentiment TEXT CHECK (sentiment IN ('positive', 'neutral', 'negative')),
  summary TEXT,
  highlights JSONB NOT NULL DEFAULT '[]'::jsonb,
  improvements JSONB NOT NULL DEFAULT '[]'::jsonb,
  conversion_likelihood TEXT CHECK (conversion_likelihood IN ('high', 'medium', 'low')),
  response_time_assessment TEXT CHECK (response_time_assessment IN ('excellent', 'good', 'slow', 'critical')),
  topics JSONB NOT NULL DEFAULT '[]'::jsonb,
  raw_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ai_analyses TO anon, authenticated;
GRANT ALL ON public.ai_analyses TO service_role;

ALTER TABLE public.ai_analyses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_analyses_read ON public.ai_analyses;
CREATE POLICY ai_analyses_read
ON public.ai_analyses
FOR SELECT
TO anon, authenticated
USING (true);

DROP TRIGGER IF EXISTS set_ai_analyses_updated_at ON public.ai_analyses;
CREATE TRIGGER set_ai_analyses_updated_at
BEFORE UPDATE ON public.ai_analyses
FOR EACH ROW
EXECUTE FUNCTION public.sac_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_ai_analyses_conversation_id ON public.ai_analyses(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_analyses_operator_id ON public.ai_analyses(operator_id);
CREATE INDEX IF NOT EXISTS idx_ai_analyses_analyzed_at ON public.ai_analyses(analyzed_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'ai_analyses'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_analyses;
  END IF;
END $$;