
REVOKE EXECUTE ON FUNCTION public.is_owner() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_owner() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.claim_ownership() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ownership() TO service_role;
