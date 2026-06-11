
-- Remove broad SELECT policy that allowed listing all files.
-- Public bucket downloads via getPublicUrl() bypass storage.objects RLS,
-- so existing image links keep working.
DROP POLICY IF EXISTS chat_images_public_read ON storage.objects;

-- Lock down trigger-only SECURITY DEFINER function so it cannot be called by clients.
REVOKE ALL ON FUNCTION public.claim_ownership() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_ownership() FROM anon;
REVOKE ALL ON FUNCTION public.claim_ownership() FROM authenticated;
