CREATE TABLE public.executions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  script_id TEXT NOT NULL DEFAULT 'u_exec_' || substr(gen_random_uuid()::text, 1, 8),
  language TEXT NOT NULL DEFAULT 'python',
  intent TEXT,
  code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'running', 'success', 'error')),
  safety_score DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  output TEXT,
  error TEXT,
  field_impact JSONB DEFAULT '{"fz": 0, "fy": 0}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on executions" ON public.executions FOR ALL TO public USING (true) WITH CHECK (true);