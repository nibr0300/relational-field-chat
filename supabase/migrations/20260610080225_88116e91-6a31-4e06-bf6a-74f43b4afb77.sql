
-- 1. Owner helper
CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.rfa_runtime_state
    WHERE key = 'owner_user_id'
      AND (value->>'uid')::uuid = auth.uid()
  )
$$;

-- 2. Claim ownership on first signup
CREATE OR REPLACE FUNCTION public.claim_ownership()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.rfa_runtime_state(key, value)
  VALUES ('owner_user_id', jsonb_build_object('uid', NEW.id::text))
  ON CONFLICT (key) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_claim_owner ON auth.users;
CREATE TRIGGER on_auth_user_created_claim_owner
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.claim_ownership();

-- 3. Helper: drop all existing policies on a table, then add owner-only policy
DO $$
DECLARE
  t text;
  pol record;
  tables text[] := ARRAY[
    'constitution_rules','conversations','distillation_runs','executions',
    'mcp_eigenstates','memory_corona','memory_eigenstates','memory_friction',
    'memory_limbus','memory_vortex','messages','prm_collapse_events',
    'prm_lambda_state','prm_signals','prospective_prm_signals',
    'raap_episodes','raap_heuristics','raap_runs','rfa_frames','rfa_runtime_state'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- drop all existing policies
    FOR pol IN
      SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
    END LOOP;

    -- revoke anon, ensure authenticated/service_role grants
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);

    -- enable RLS (idempotent)
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    -- single owner-only policy
    EXECUTE format(
      'CREATE POLICY "owner_only" ON public.%I FOR ALL TO authenticated USING (public.is_owner()) WITH CHECK (public.is_owner())',
      t
    );
  END LOOP;
END $$;

-- 4. Storage: chat-images — restrict writes to owner, keep public read
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND (policyname ILIKE '%chat-images%' OR policyname ILIKE '%chat_images%' OR policyname ILIKE '%public upload%' OR policyname ILIKE '%public read%')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "chat_images_owner_write"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'chat-images' AND public.is_owner());

CREATE POLICY "chat_images_owner_update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'chat-images' AND public.is_owner())
WITH CHECK (bucket_id = 'chat-images' AND public.is_owner());

CREATE POLICY "chat_images_owner_delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'chat-images' AND public.is_owner());

CREATE POLICY "chat_images_public_read"
ON storage.objects FOR SELECT TO anon, authenticated
USING (bucket_id = 'chat-images');
