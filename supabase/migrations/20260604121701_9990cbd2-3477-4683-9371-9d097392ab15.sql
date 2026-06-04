-- Fas 1.1: utöka prm_signals med WPA-fält
ALTER TABLE public.prm_signals
  ADD COLUMN IF NOT EXISTS recurrence_count INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS amplification_factor DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS is_amplified BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_prm_signals_pattern_conv
  ON public.prm_signals (conversation_id, dominant_pattern, last_seen_at DESC);

-- Fas 1.2: prospective_prm_signals
CREATE TABLE IF NOT EXISTS public.prospective_prm_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fork_context TEXT NOT NULL,
  momentum_direction TEXT NOT NULL,
  path_resonances JSONB NOT NULL,
  raw_signal JSONB NOT NULL
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prospective_prm_signals TO authenticated;
GRANT ALL ON public.prospective_prm_signals TO service_role;

ALTER TABLE public.prospective_prm_signals ENABLE ROW LEVEL SECURITY;

-- Inga klientpolicyer: edge functions använder service_role.
-- (RLS aktivt = klienter blockerade tills vidare.)

CREATE INDEX IF NOT EXISTS idx_prospective_conv
  ON public.prospective_prm_signals (conversation_id, created_at DESC);