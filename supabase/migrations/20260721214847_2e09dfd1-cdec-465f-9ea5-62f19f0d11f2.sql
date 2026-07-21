ALTER TABLE public.operators
  ADD COLUMN IF NOT EXISTS user_id uuid DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS email   text DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_operators_user_id
  ON public.operators (user_id)
  WHERE user_id IS NOT NULL;

ALTER TABLE public.tenant_users
  ADD COLUMN IF NOT EXISTS operator_id uuid
    REFERENCES public.operators(id) ON DELETE SET NULL DEFAULT NULL;