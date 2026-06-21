
CREATE TABLE public.session_episodic (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  user_id uuid NOT NULL,
  focus text NOT NULL DEFAULT '',
  timeline jsonb NOT NULL DEFAULT '[]'::jsonb,
  artifacts jsonb NOT NULL DEFAULT '[]'::jsonb,
  open_threads jsonb NOT NULL DEFAULT '[]'::jsonb,
  affective_residue jsonb NOT NULL DEFAULT '{}'::jsonb,
  digest text NOT NULL DEFAULT '',
  turn_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id)
);
CREATE INDEX idx_session_episodic_conv ON public.session_episodic(conversation_id);
CREATE INDEX idx_session_episodic_user ON public.session_episodic(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.session_episodic TO authenticated;
GRANT ALL ON public.session_episodic TO service_role;
ALTER TABLE public.session_episodic ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manages session_episodic"
  ON public.session_episodic FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.session_open_loops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  user_id uuid NOT NULL,
  description text NOT NULL,
  urgency real NOT NULL DEFAULT 0.5,
  closure_conditions jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'active',
  opened_at_turn integer NOT NULL DEFAULT 0,
  closed_at timestamptz,
  closure_outcome text,
  source text NOT NULL DEFAULT 'auto',
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_open_loops_conv_status ON public.session_open_loops(conversation_id, status);
CREATE INDEX idx_open_loops_user ON public.session_open_loops(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.session_open_loops TO authenticated;
GRANT ALL ON public.session_open_loops TO service_role;
ALTER TABLE public.session_open_loops ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manages session_open_loops"
  ON public.session_open_loops FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_session_episodic_updated_at
  BEFORE UPDATE ON public.session_episodic
  FOR EACH ROW EXECUTE FUNCTION public.update_memory_timestamp();

CREATE TRIGGER trg_session_open_loops_updated_at
  BEFORE UPDATE ON public.session_open_loops
  FOR EACH ROW EXECUTE FUNCTION public.update_memory_timestamp();
