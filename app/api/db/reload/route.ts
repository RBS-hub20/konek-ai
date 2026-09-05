import { db, hasSupabase } from '@/lib/supabase';
import { describeError, fail, ok } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/db/reload
 *
 * Asks PostgREST to reload its schema cache. A migration can leave the cache
 * holding a half-applied view of the schema, which reads exactly like missing
 * columns — this is the fix, without opening the SQL editor.
 *
 * Needs public.reload_schema_cache(), created by supabase.sql.
 */
export async function POST() {
  if (!hasSupabase) return fail('No database connected.', 503);
  try {
    const { error } = await db().rpc('reload_schema_cache');
    if (error) {
      return fail(
        'Could not reload the schema cache',
        502,
        `${error.message}. Re-run supabase.sql to create reload_schema_cache(), or run "notify pgrst, 'reload schema';" in the SQL editor.`
      );
    }
    return ok({ reloaded: true, note: 'PostgREST will pick up the current schema within a second or two.' });
  } catch (err) {
    return fail('Could not reload the schema cache', 502, describeError(err).detail);
  }
}
