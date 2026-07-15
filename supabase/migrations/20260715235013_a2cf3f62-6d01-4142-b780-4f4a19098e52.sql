CREATE TABLE public.jacobian_analyses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  conversation_id UUID,
  trigger TEXT NOT NULL,
  gate_decision TEXT,
  f_z NUMERIC,
  fork_type TEXT,
  variants JSONB NOT NULL DEFAULT '[]'::jsonb,
  gradients JSONB NOT NULL DEFAULT '{}'::jsonb,
  chosen_variant_index INT,
  operator_nudge JSONB,
  epistemic_nudge TEXT,
  nudge_line TEXT,
  duration_ms INT,
  model_used TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.jacobian_analyses TO authenticated;
GRANT ALL ON public.jacobian_analyses TO service_role;

ALTER TABLE public.jacobian_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage their jacobian analyses"
  ON public.jacobian_analyses FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_jacobian_analyses_user_created
  ON public.jacobian_analyses (user_id, created_at DESC);
CREATE INDEX idx_jacobian_analyses_conversation
  ON public.jacobian_analyses (conversation_id, created_at DESC);