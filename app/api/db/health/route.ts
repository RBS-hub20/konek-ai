import { db, hasSupabase } from '@/lib/supabase';
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
export async function GET() {
  if (!hasSupabase) {
    return ok({ connected: false, note: 'No Supabase credentials — running on in-memory data.' });
  }

  const tables: Record<string, unknown> = {};
  const missingColumns: string[] = [];
  const missingTables: string[] = [];

  for (const [table, expected] of Object.entries(EXPECTED)) {
    try {
      const { data, error } = await db().from(table).select('*').limit(1);
      if (error) {
        tables[table] = { exists: false, error: describeError(error).detail };
        missingTables.push(table);
        continue;
      }
      const row = (data ?? [])[0];
      if (!row) {
        /* An empty table hides its shape, so only report reachability. */
        tables[table] = { exists: true, rows: 0, columns: null, note: 'empty — column check needs at least one row' };
        continue;
      }
      const present = Object.keys(row);
      const missing = expected.filter((c) => !present.includes(c));
      tables[table] = { exists: true, rows: '1+', columns: present.length, missing };
      for (const c of missing) missingColumns.push(`${table}.${c}`);
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
      : { fix: 'Run supabase.sql in the Supabase SQL Editor — it is additive and ends with NOTIFY pgrst.' }),
  });
}
