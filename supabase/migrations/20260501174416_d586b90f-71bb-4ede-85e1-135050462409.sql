-- Add invariant tracking to executions for Command Algebra invariant-gate
ALTER TABLE public.executions
  ADD COLUMN IF NOT EXISTS preconditions jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS postconditions jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS invariant_results jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS invariant_status text NOT NULL DEFAULT 'unchecked';

-- invariant_status: 'unchecked' | 'passed' | 'pre_failed' | 'post_failed'
COMMENT ON COLUMN public.executions.preconditions IS 'Array of {name, expression} assertions to verify BEFORE running code';
COMMENT ON COLUMN public.executions.postconditions IS 'Array of {name, expression} assertions to verify AFTER running code';
COMMENT ON COLUMN public.executions.invariant_results IS 'Per-assertion results: {name: {passed: bool, value: any, error?: string}}';
