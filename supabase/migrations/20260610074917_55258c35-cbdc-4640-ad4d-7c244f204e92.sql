
-- Lambda state per conversation (5-state leaky integrators + genotype Γ)
CREATE TABLE public.prm_lambda_state (
  conversation_id uuid PRIMARY KEY REFERENCES public.conversations(id) ON DELETE CASCADE,
  -- 5 tillstånd (S, B, C, St, V) i intervallet ungefär [0, 1]
  s_stim numeric NOT NULL DEFAULT 0,
  b_reward numeric NOT NULL DEFAULT 0,
  c_confirm numeric NOT NULL DEFAULT 0,
  st_status numeric NOT NULL DEFAULT 0,
  v_rest numeric NOT NULL DEFAULT 0.5,
  -- Genotyp Γ: tidsskalor (turns) -> λ = 1 - exp(-1/τ)
  tau_s numeric NOT NULL DEFAULT 5,
  tau_b numeric NOT NULL DEFAULT 4,
  tau_c numeric NOT NULL DEFAULT 80,
  tau_st numeric NOT NULL DEFAULT 30,
  tau_v numeric NOT NULL DEFAULT 60,
  -- Vikter i M(t)
  w_s numeric NOT NULL DEFAULT 0.8,
  w_b numeric NOT NULL DEFAULT 1.0,
  w_c numeric NOT NULL DEFAULT 1.2,
  w_st numeric NOT NULL DEFAULT 0.6,
  w_v numeric NOT NULL DEFAULT 0.7,
  -- Gain-koefficienter (dopamin/homeostas/GABA-analoger)
  kappa_d numeric NOT NULL DEFAULT 1.0,
  kappa_h numeric NOT NULL DEFAULT 1.0,
  kappa_g numeric NOT NULL DEFAULT 0.8,
  -- F-variabler senaste turn (för injektion)
  f_z numeric NOT NULL DEFAULT 0,
  f_y numeric NOT NULL DEFAULT 0,
  f_lambda numeric NOT NULL DEFAULT 0.5,
  -- Tidigare signaler för delta-beräkning
  prev_paths_entropy numeric,
  prev_assistant_quality numeric,
  prev_tension numeric,
  -- Meta
  turns_observed int NOT NULL DEFAULT 0,
  m_running numeric NOT NULL DEFAULT 0,
  phase text NOT NULL DEFAULT 'standard',
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.prm_lambda_state TO service_role;
ALTER TABLE public.prm_lambda_state ENABLE ROW LEVEL SECURITY;

-- Kollaps-händelser (paradoxfullbordan, hög katharsis)
CREATE TABLE public.prm_collapse_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE,
  entropy_before numeric NOT NULL,
  entropy_after numeric NOT NULL,
  delta_entropy numeric NOT NULL,
  katharsis numeric NOT NULL,
  b_bump numeric NOT NULL DEFAULT 0,
  c_bump numeric NOT NULL DEFAULT 0,
  trigger text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.prm_collapse_events TO service_role;
ALTER TABLE public.prm_collapse_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_prm_collapse_conv ON public.prm_collapse_events(conversation_id, created_at DESC);

-- Trigger för updated_at på lambda_state
CREATE TRIGGER trg_prm_lambda_updated
  BEFORE UPDATE ON public.prm_lambda_state
  FOR EACH ROW EXECUTE FUNCTION public.update_memory_timestamp();
