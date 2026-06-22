
-- dream_cycles
CREATE TABLE public.dream_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  trigger TEXT NOT NULL CHECK (trigger IN ('manual','idle_threshold','scheduled')),
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed')),
  event_window_start TIMESTAMPTZ,
  event_window_end TIMESTAMPTZ,
  hypotheses_generated INT NOT NULL DEFAULT 0,
  hypotheses_consolidated INT NOT NULL DEFAULT 0,
  hypotheses_forgotten INT NOT NULL DEFAULT 0,
  dissonance_count INT NOT NULL DEFAULT 0,
  lambda_snapshot JSONB,
  summary TEXT,
  error TEXT,
  duration_ms INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_dream_cycles_user_created ON public.dream_cycles(user_id, created_at DESC);
CREATE INDEX idx_dream_cycles_conv ON public.dream_cycles(conversation_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dream_cycles TO authenticated;
GRANT ALL ON public.dream_cycles TO service_role;

ALTER TABLE public.dream_cycles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner manages own dream cycles"
  ON public.dream_cycles FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- dream_hypotheses
CREATE TABLE public.dream_hypotheses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES public.dream_cycles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  source_ref TEXT,
  phase TEXT NOT NULL CHECK (phase IN ('void','vortex','reset')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','consolidated','forgotten','dissonance')),
  content TEXT NOT NULL,
  prior NUMERIC(5,4) NOT NULL DEFAULT 0,
  likelihood NUMERIC(5,4) NOT NULL DEFAULT 0,
  posterior NUMERIC(5,4) NOT NULL DEFAULT 0,
  affective_resonance JSONB,
  promoted_to_table TEXT,
  promoted_to_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_dream_hyp_cycle ON public.dream_hypotheses(cycle_id);
CREATE INDEX idx_dream_hyp_user_status ON public.dream_hypotheses(user_id, status, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dream_hypotheses TO authenticated;
GRANT ALL ON public.dream_hypotheses TO service_role;

ALTER TABLE public.dream_hypotheses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner manages own dream hypotheses"
  ON public.dream_hypotheses FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
