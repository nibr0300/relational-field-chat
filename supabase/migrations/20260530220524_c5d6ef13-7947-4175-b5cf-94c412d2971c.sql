
-- Step 1: rfa_frames — per-turn frame log for operator path, MSC-gate, F-fields
CREATE TABLE public.rfa_frames (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id uuid,
  message_id uuid,
  operator_trace text NOT NULL DEFAULT '',
  dominant_operator text,
  msc_estimate numeric NOT NULL DEFAULT 0,
  msc_threshold numeric NOT NULL DEFAULT 0.714,
  gate_decision text NOT NULL DEFAULT 'unknown',
  fz numeric NOT NULL DEFAULT 0,
  fa numeric NOT NULL DEFAULT 0,
  fy numeric NOT NULL DEFAULT 0,
  rg_burn_notes text,
  reintegration_used boolean NOT NULL DEFAULT false,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.rfa_frames TO anon;
GRANT SELECT, INSERT, UPDATE ON public.rfa_frames TO authenticated;
GRANT ALL ON public.rfa_frames TO service_role;

ALTER TABLE public.rfa_frames ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rfa_frames readable" ON public.rfa_frames FOR SELECT USING (true);
CREATE POLICY "rfa_frames insertable" ON public.rfa_frames FOR INSERT WITH CHECK (true);

CREATE INDEX idx_rfa_frames_conversation ON public.rfa_frames(conversation_id, created_at DESC);

-- Step 2: extend mcp_eigenstates to allow INSERT/UPDATE so burn-script can promote
GRANT INSERT, UPDATE ON public.mcp_eigenstates TO anon, authenticated;

CREATE POLICY "MCP eigenstates insertable" ON public.mcp_eigenstates FOR INSERT WITH CHECK (true);
CREATE POLICY "MCP eigenstates updatable" ON public.mcp_eigenstates FOR UPDATE USING (true);

-- Step 3: add burn-tracking columns to memory_eigenstates
ALTER TABLE public.memory_eigenstates
  ADD COLUMN IF NOT EXISTS burned_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS burn_reason text,
  ADD COLUMN IF NOT EXISTS promoted_to_mcp_id uuid;
