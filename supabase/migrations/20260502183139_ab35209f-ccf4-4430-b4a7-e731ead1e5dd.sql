
CREATE TABLE public.raap_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid,
  trigger_type text NOT NULL DEFAULT 'auto', -- 'auto' | 'manual' | 'suggested'
  trigger_reason text,
  goal text NOT NULL,
  strategy text, -- 'cot' | 'tot' | 'got' | 'mcts' | 'analogical' | 'skeletal'
  depth text NOT NULL DEFAULT 'full', -- 'light' | 'medium' | 'full'
  plan_dag jsonb NOT NULL DEFAULT '[]'::jsonb,
  branches_explored integer NOT NULL DEFAULT 0,
  backtracks integer NOT NULL DEFAULT 0,
  llm_calls integer NOT NULL DEFAULT 0,
  final_answer text,
  status text NOT NULL DEFAULT 'running', -- 'running' | 'success' | 'error' | 'aborted'
  error text,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE public.raap_episodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.raap_runs(id) ON DELETE CASCADE,
  step_index integer NOT NULL,
  phase text NOT NULL, -- 'decompose' | 'reason' | 'simulate' | 'act' | 'reflect' | 'backtrack' | 'meta'
  sub_goal text,
  action text,
  expected_outcome text,
  actual_outcome text,
  reflection text,
  discrepancy double precision DEFAULT 0,
  confidence double precision DEFAULT 0.5,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.raap_heuristics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern text NOT NULL,
  recommendation text NOT NULL,
  problem_class text, -- e.g. 'math', 'open-ended', 'tool-heavy'
  evidence_count integer NOT NULL DEFAULT 1,
  success_rate double precision NOT NULL DEFAULT 0.5,
  source_run_ids uuid[] DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_raap_episodes_run ON public.raap_episodes(run_id, step_index);
CREATE INDEX idx_raap_runs_conv ON public.raap_runs(conversation_id, created_at DESC);
CREATE INDEX idx_raap_heuristics_active ON public.raap_heuristics(is_active, success_rate DESC);

ALTER TABLE public.raap_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raap_episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raap_heuristics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on raap_runs" ON public.raap_runs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on raap_episodes" ON public.raap_episodes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on raap_heuristics" ON public.raap_heuristics FOR ALL USING (true) WITH CHECK (true);
