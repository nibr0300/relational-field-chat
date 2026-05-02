-- Konstitutionsregler: validerade, permanenta uppgraderingar destillerade ur samtalshistorik
CREATE TABLE public.constitution_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_code text NOT NULL UNIQUE,
  trigger_description text NOT NULL,
  behavior_contract text NOT NULL,
  source_citations jsonb NOT NULL DEFAULT '[]'::jsonb,
  validation_score double precision NOT NULL DEFAULT 0,
  effect_size double precision NOT NULL DEFAULT 0,
  test_cases jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  is_core boolean NOT NULL DEFAULT false,
  cycle_number integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz,
  retired_reason text
);

ALTER TABLE public.constitution_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on constitution_rules"
  ON public.constitution_rules FOR ALL
  USING (true) WITH CHECK (true);

CREATE INDEX idx_constitution_rules_active ON public.constitution_rules(is_active, is_core);

CREATE TRIGGER update_constitution_rules_timestamp
  BEFORE UPDATE ON public.constitution_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_memory_timestamp();

-- Distillationskörningar: revisionslogg för varje cykel
CREATE TABLE public.distillation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_type text NOT NULL DEFAULT 'manual',
  scope text NOT NULL DEFAULT 'all',
  scope_ref text,
  cycles_completed integer NOT NULL DEFAULT 0,
  fragments_extracted integer NOT NULL DEFAULT 0,
  rules_proposed integer NOT NULL DEFAULT 0,
  rules_validated integer NOT NULL DEFAULT 0,
  rules_rejected integer NOT NULL DEFAULT 0,
  termination_reason text,
  protocol_log jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'running',
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE public.distillation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on distillation_runs"
  ON public.distillation_runs FOR ALL
  USING (true) WITH CHECK (true);

CREATE INDEX idx_distillation_runs_created ON public.distillation_runs(created_at DESC);