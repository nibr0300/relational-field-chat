CREATE TABLE public.prm_signals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID,
  tension NUMERIC(4,3) NOT NULL DEFAULT 0,
  dominant_pattern TEXT,
  valence TEXT,
  whisper TEXT,
  suggested_operator TEXT,
  confidence NUMERIC(4,3) NOT NULL DEFAULT 0,
  latency_ms INTEGER,
  outcome TEXT,
  raw_signal JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.prm_signals TO service_role;

ALTER TABLE public.prm_signals ENABLE ROW LEVEL SECURITY;

CREATE INDEX prm_signals_conversation_idx ON public.prm_signals (conversation_id, created_at DESC);