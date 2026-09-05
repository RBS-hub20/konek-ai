import { db, hasSupabase } from '@/lib/supabase';
import { isMissingTable } from '@/lib/server/resilient';
import { describeError, ok } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/* What each table must have for the app to record a call properly. A column
   that is missing here is not an error at write time — the resilient writer
   drops it and carries on — which is exactly why it needs surfacing. */
const EXPECTED: Record<string, string[]> = {
  businesses: [
    'id', 'name', 'slug', 'owner_email', 'outbound_number', 'plan', 'calls_used',
    'calls_limit', 'status', 'mrr', 'active_vibe', 'language', 'settings', 'created_at',
  ],
  call_logs: [
    'id', 'business_id', 'campaign_id', 'contact_id', 'customer_name', 'phone',
    'vibe', 'language', 'duration_seconds', 'status', 'recording_url', 'transcript',
    'twilio_sid', 'skills_used', 'created_at',
  ],
  campaigns: ['id', 'business_id', 'name', 'vibe', 'status', 'audience_count', 'called_count', 'hot_leads', 'skills'],
  contacts: ['id', 'business_id', 'campaign_id', 'name', 'phone', 'status'],
  business_brain: ['id', 'business_id', 'business_name', 'what_you_sell', 'price_range', 'goal', 'knowledge_files'],
  skills: ['id', 'name', 'description', 'category', 'system_prompt', 'business_id', 'is_active'],
  business_skills: ['business_id', 'skill_id', 'is_active'],
  business_integrations: ['id', 'business_id', 'provider', 'is_connected'],
};

/**
 * GET /api/db/health
 *
 * Reports which tables and columns actually exist. Writes drop unknown columns
 * to keep calls working, so a half-migrated table looks fine until you notice
 * every phone number is null — this makes that visible in one request.
 */
/**
 * Asks PostgREST for each column directly.
 *
 * Inferring columns from a sample row cannot see an empty table and misses a
 * column whose value happens to be absent, so this selects the columns instead
 * and reads the rejection: PostgREST names the offending column when it does
 * not exist.
 */
async function inspect(table: string, expected: string[]) {
  /* One request settles it when everything is present. */
  const { error } = await db().from(table).select(expected.join(',')).limit(1);
  if (!error) return { exists: true, missing: [] as string[] };

  const err = error as { code?: string; message?: string };
  if (isMissingTable(err)) return { exists: false, missing: expected, error: err.message };

  /* Something is absent — find out exactly which, one column at a time. */
  const missing: string[] = [];
  const results = await Promise.all(
    expected.map(async (col) => {
      const { error: e } = await db().from(table).select(col).limit(1);
      return [col, e ? (e as { message?: string }).message ?? 'error' : null] as const;
    })
  );
  for (const [col, problem] of results) if (problem) missing.push(col);

  return { exists: true, missing, error: missing.length ? undefined : err.message };
}

export async function GET() {
  if (!hasSupabase) {
    return ok({ connected: false, note: 'No Supabase credentials — running on in-memory data.' });
  }

  const tables: Record<string, unknown> = {};
  const missingColumns: string[] = [];
  const missingTables: string[] = [];

  for (const [table, expected] of Object.entries(EXPECTED)) {
    try {
      const res = await inspect(table, expected);
      if (!res.exists) {
        tables[table] = { exists: false, error: res.error };
        missingTables.push(table);
        continue;
      }
      /* Row count is useful context but no longer what the check depends on. */
      const { count } = await db().from(table).select('*', { count: 'exact', head: true });
      tables[table] = { exists: true, rows: count ?? null, missing: res.missing };
      for (const c of res.missing) missingColumns.push(`${table}.${c}`);
    } catch (err) {
      tables[table] = { exists: false, error: describeError(err).detail };
      missingTables.push(table);
    }
  }

  const healthy = missingTables.length === 0 && missingColumns.length === 0;
  return ok({
    connected: true,
    healthy,
    missingTables,
    missingColumns,
    tables,
    ...(healthy
      ? {}
      : {
          fix: 'Run supabase.sql in the Supabase SQL Editor. If it has already been run, PostgREST may be holding a stale schema cache — run: notify pgrst, \'reload schema\';',
        }),
  });
}
