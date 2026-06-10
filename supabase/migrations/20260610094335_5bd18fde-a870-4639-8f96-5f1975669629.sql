
DO $$
DECLARE
  v_owner uuid := 'fab10a9c-d4b7-4b7c-86d2-0109c9e40fbb';
  t text;
  per_user_tables text[] := ARRAY[
    'conversations','messages',
    'memory_corona','memory_limbus','memory_vortex','memory_friction',
    'prm_signals','prm_lambda_state','prm_collapse_events','prospective_prm_signals',
    'raap_runs','raap_episodes','raap_heuristics',
    'rfa_frames','distillation_runs','executions'
  ];
BEGIN
  FOREACH t IN ARRAY per_user_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS user_id uuid', t);
    EXECUTE format('UPDATE public.%I SET user_id = %L WHERE user_id IS NULL', t, v_owner);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN user_id SET NOT NULL', t);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN user_id SET DEFAULT auth.uid()', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(user_id)', t || '_user_id_idx', t);
  END LOOP;
END $$;

DO $$
DECLARE
  pol record;
  t text;
  per_user_tables text[] := ARRAY[
    'conversations','messages',
    'memory_corona','memory_limbus','memory_vortex','memory_friction',
    'prm_signals','prm_lambda_state','prm_collapse_events','prospective_prm_signals',
    'raap_runs','raap_episodes','raap_heuristics',
    'rfa_frames','distillation_runs','executions'
  ];
BEGIN
  FOREACH t IN ARRAY per_user_tables LOOP
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
    END LOOP;
    EXECUTE format('CREATE POLICY "own rows" ON public.%I FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

DO $$
DECLARE
  pol record;
  t text;
  shared_tables text[] := ARRAY['constitution_rules','mcp_eigenstates','memory_eigenstates','rfa_runtime_state'];
BEGIN
  FOREACH t IN ARRAY shared_tables LOOP
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
    END LOOP;
    EXECUTE format('CREATE POLICY "auth read" ON public.%I FOR SELECT TO authenticated USING (true)', t);
    EXECUTE format('CREATE POLICY "owner write" ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_owner())', t);
    EXECUTE format('CREATE POLICY "owner update" ON public.%I FOR UPDATE TO authenticated USING (public.is_owner()) WITH CHECK (public.is_owner())', t);
    EXECUTE format('CREATE POLICY "owner delete" ON public.%I FOR DELETE TO authenticated USING (public.is_owner())', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;
