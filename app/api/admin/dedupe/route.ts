import { db, hasSupabase } from '@/lib/supabase';
import { listBusinesses } from '@/lib/server/tenant';
import type { Business } from '@/lib/types2';
import { describeError, fail, ok, readJson } from '@/lib/server/http';
import { isAuthorizedCaller } from '@/lib/server/operator';
import { env, hasTwilio } from '@/lib/env';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/* Tables that point at a business and must be moved to the survivor before a
   duplicate is removed, or their rows go with it. */
const CHILD_TABLES = [
  'call_logs', 'campaigns', 'contacts', 'business_brain',
  'brain_chunks', 'business_skills', 'business_integrations', 'skills',
];

interface Group {
  key: string;
  keep: Business;
  remove: Business[];
}

/** Groups tenants that are the same business by email, then name + number. */
function findDuplicates(businesses: Business[]): Group[] {
  const buckets = new Map<string, Business[]>();
  for (const b of businesses) {
    const key = (b.owner_email?.trim().toLowerCase())
      || `${b.name.trim().toLowerCase()}|${(b.outbound_number ?? '').replace(/\D/g, '')}`;
    buckets.set(key, [...(buckets.get(key) ?? []), b]);
  }

  const groups: Group[] = [];
  for (const [key, rows] of Array.from(buckets.entries())) {
    if (rows.length < 2) continue;
    /* Oldest wins. The duplicates here were created in the same second, so id
       breaks the tie deterministically rather than by whichever sorted first. */
    const sorted = [...rows].sort((a, b) => {
      const t = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return t !== 0 ? t : a.id.localeCompare(b.id);
    });
    groups.push({ key, keep: sorted[0], remove: sorted.slice(1) });
  }
  return groups;
}

/** GET /api/admin/dedupe — what would be removed. Changes nothing. */
export async function GET() {
  try {
    const businesses = await listBusinesses();
    const groups = findDuplicates(businesses);
    return ok({
      duplicateGroups: groups.length,
      wouldRemove: groups.reduce((n, g) => n + g.remove.length, 0),
      groups: groups.map((g) => ({
        key: g.key,
        keep: { id: g.keep.id, name: g.keep.name, created_at: g.keep.created_at },
        remove: g.remove.map((r) => ({ id: r.id, name: r.name, created_at: r.created_at })),
      })),
      distinctMrr: businesses
        .filter((b) => groups.every((g) => !g.remove.some((r) => r.id === b.id)))
        .reduce((s, b) => s + (b.mrr ?? 0), 0),
    });
  } catch (err) {
    return fail('Could not read businesses', 500, describeError(err).detail);
  }
}

/**
 * POST /api/admin/dedupe — { confirm: true }
 *
 * Moves every child row onto the surviving tenant, then deletes the duplicates.
 * Destructive, so it needs the operator key or cookie whenever live calling is
 * configured, and refuses without an explicit confirm either way.
 */
export async function POST(req: Request) {
  if (hasTwilio && env.apiSecret && !isAuthorizedCaller(req)) {
    return Response.json(
      { error: 'Unlock required — this permanently deletes tenant rows.', needsUnlock: true },
      { status: 401 }
    );
  }

  const body = await readJson<{ confirm?: boolean }>(req);
  if (!body?.confirm) {
    return fail('Pass { "confirm": true } to delete the duplicates. GET this URL first to see what would go.', 400);
  }
  if (!hasSupabase) return fail('No database connected.', 503);

  try {
    const groups = findDuplicates(await listBusinesses());
    if (!groups.length) return ok({ removed: 0, note: 'No duplicates found.' });

    const moved: Record<string, number> = {};
    const removed: string[] = [];
    const problems: string[] = [];

    for (const group of groups) {
      for (const dupe of group.remove) {
        /* Re-point children first — deleting a tenant cascades otherwise. */
        for (const table of CHILD_TABLES) {
          try {
            const { data, error } = await db()
              .from(table)
              .update({ business_id: group.keep.id })
              .eq('business_id', dupe.id)
              .select('*');
            if (error) {
              /* A table that does not exist here is not a failure. */
              if (!/Could not find the table|does not exist/i.test(error.message ?? '')) {
                problems.push(`${table}: ${error.message}`);
              }
              continue;
            }
            if (data?.length) moved[table] = (moved[table] ?? 0) + data.length;
          } catch (err) {
            problems.push(`${table}: ${describeError(err).detail}`);
          }
        }

        const { error } = await db().from('businesses').delete().eq('id', dupe.id);
        if (error) problems.push(`delete ${dupe.id}: ${error.message}`);
        else removed.push(dupe.id);
      }
    }

    const after = await listBusinesses();
    return ok({
      removed: removed.length,
      removedIds: removed,
      movedChildRows: moved,
      remaining: after.length,
      mrr: after.reduce((s, b) => s + (b.mrr ?? 0), 0),
      ...(problems.length ? { problems } : {}),
    });
  } catch (err) {
    return fail('Dedupe failed', 500, describeError(err).detail);
  }
}
