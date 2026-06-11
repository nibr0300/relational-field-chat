const SUPABASE_AUTH_KEY_PREFIX = "sb-";
const SUPABASE_AUTH_KEY_SUFFIX = "-auth-token";

export function clearStoredAuthSession() {
  for (let i = localStorage.length - 1; i >= 0; i -= 1) {
    const key = localStorage.key(i);
    if (key?.startsWith(SUPABASE_AUTH_KEY_PREFIX) && key.endsWith(SUPABASE_AUTH_KEY_SUFFIX)) {
      localStorage.removeItem(key);
    }
  }
}

export async function hardSignOut(signOut: () => Promise<unknown>) {
  try {
    await signOut();
  } finally {
    clearStoredAuthSession();
  }
}