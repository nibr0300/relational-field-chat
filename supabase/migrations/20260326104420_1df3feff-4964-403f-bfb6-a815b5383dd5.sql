
CREATE TABLE public.memory_eigenstates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL DEFAULT 'general',
  content text NOT NULL,
  significance float NOT NULL DEFAULT 0.7,
  source_conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.memory_eigenstates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on memory_eigenstates"
  ON public.memory_eigenstates FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);
