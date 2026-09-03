import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env, hasSupabase, hasSupabaseAdmin } from './env';

/* createClient throws on an empty/invalid URL, which would break the build
   before anyone has filled in .env.local. So the clients are only real when
   the credentials are real; otherwise they point at a local stub that is
   never called (every caller checks hasSupabase first). */

const FALLBACK_URL = 'http://127.0.0.1:54321';
const FALLBACK_KEY = 'public-anon-key';

/* Warn once per server process rather than crashing the build. Every caller
   checks hasSupabase and uses the in-memory store instead. */
if (!hasSupabase) {
  console.warn(
    '[KONEK AI] Supabase is not configured (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY missing or still placeholders). Falling back to in-memory data — writes will not persist. See README_VERCEL.md.'
  );
} else if (!hasSupabaseAdmin) {
  console.warn(
    '[KONEK AI] SUPABASE_SERVICE_ROLE_KEY is missing — server writes will use the anon key and will fail once RLS is enabled.'
  );
}

export const supabase: SupabaseClient = createClient(
  hasSupabase ? env.supabaseUrl : FALLBACK_URL,
  hasSupabase ? env.supabaseAnonKey : FALLBACK_KEY,
  { auth: { persistSession: false } }
);

/* Service-role client — server only. Never import this into a client component. */
export const supabaseAdmin: SupabaseClient = createClient(
  hasSupabaseAdmin ? env.supabaseUrl : FALLBACK_URL,
  hasSupabaseAdmin ? env.supabaseServiceKey : FALLBACK_KEY,
  { auth: { persistSession: false } }
);

export { hasSupabase, hasSupabaseAdmin };

/** Server-side client for reads/writes: service role when available. */
export function db(): SupabaseClient {
  return hasSupabaseAdmin ? supabaseAdmin : supabase;
}
