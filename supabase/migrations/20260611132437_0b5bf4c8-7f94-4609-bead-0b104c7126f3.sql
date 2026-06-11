
CREATE EXTENSION IF NOT EXISTS vector;

-- ─── documents ─────────────────────────────────────────────
CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  storage_path text,
  mime_type text,
  size_bytes integer,
  char_count integer DEFAULT 0,
  chunk_count integer DEFAULT 0,
  tags text[] DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending', -- pending | ingesting | ready | error
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO authenticated;
GRANT ALL ON public.documents TO service_role;

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY documents_owner_all ON public.documents
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TRIGGER documents_touch_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.update_memory_timestamp();

CREATE INDEX documents_user_idx ON public.documents(user_id, created_at DESC);
CREATE INDEX documents_user_title_idx ON public.documents(user_id, lower(title));

-- ─── document_chunks ───────────────────────────────────────
CREATE TABLE public.document_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL,
  content text NOT NULL,
  embedding vector(1536) NOT NULL,
  token_estimate integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_chunks TO authenticated;
GRANT ALL ON public.document_chunks TO service_role;

ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY document_chunks_owner_all ON public.document_chunks
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX document_chunks_doc_idx ON public.document_chunks(document_id, chunk_index);
CREATE INDEX document_chunks_user_idx ON public.document_chunks(user_id);
CREATE INDEX document_chunks_embedding_idx
  ON public.document_chunks USING hnsw (embedding vector_cosine_ops);

-- ─── match function (per-user scoped) ──────────────────────
CREATE OR REPLACE FUNCTION public.match_document_chunks(
  query_embedding vector(1536),
  match_count int DEFAULT 6,
  filter_user uuid DEFAULT NULL,
  filter_document_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  chunk_id uuid,
  document_id uuid,
  title text,
  chunk_index integer,
  content text,
  similarity float
)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    c.id AS chunk_id,
    c.document_id,
    d.title,
    c.chunk_index,
    c.content,
    1 - (c.embedding <=> query_embedding) AS similarity
  FROM public.document_chunks c
  JOIN public.documents d ON d.id = c.document_id
  WHERE
    (filter_user IS NULL OR c.user_id = filter_user)
    AND (filter_document_ids IS NULL OR c.document_id = ANY (filter_document_ids))
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
$$;

REVOKE ALL ON FUNCTION public.match_document_chunks(vector, int, uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_document_chunks(vector, int, uuid, uuid[]) TO authenticated, service_role;

-- ─── storage RLS for `documents` bucket ────────────────────
CREATE POLICY documents_bucket_owner_read ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'documents' AND owner = auth.uid());

CREATE POLICY documents_bucket_owner_write ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documents' AND owner = auth.uid());

CREATE POLICY documents_bucket_owner_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'documents' AND owner = auth.uid())
  WITH CHECK (bucket_id = 'documents' AND owner = auth.uid());

CREATE POLICY documents_bucket_owner_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'documents' AND owner = auth.uid());
