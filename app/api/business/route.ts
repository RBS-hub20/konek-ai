import { createBusiness, getBusiness, listBusinesses, listCallLogs, safe, updateBusiness } from '@/lib/server/tenant';
import type { Business } from '@/lib/types2';
import { fail, handle, ok, readJson, describeError } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** GET /api/business             → all tenants + platform stats (super admin)
 *  GET /api/business?current=1   → the tenant the dashboard is operating on
 *  GET /api/business?id=<uuid>   → one tenant */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  return handle(async () => {
    if (p.get('id')) return { business: await getBusiness(p.get('id')) };
    if (p.get('current')) return { business: await getBusiness() };

    /* Either table may not exist yet; the console should still render. */
    const businesses = await safe(() => listBusinesses(), []);
    const allCalls = await safe(() => listCallLogs(null, 500), []);

    /* Totals are computed over distinct tenants. Two rows for the same
       business would otherwise double the MRR, which is how $49 read as $98. */
    const seen = new Set<string>();
    const distinct = businesses.filter((b) => {
      const key = (b.owner_email?.trim().toLowerCase())
        || `${b.name.trim().toLowerCase()}|${(b.outbound_number ?? '').replace(/\D/g, '')}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const duplicates = businesses.length - distinct.length;

    /* A call that never connected has no duration and should not inflate the
       "calls handled" figure. */
    const connected = allCalls.filter(
      (c) => !['Failed', 'No Answer', 'Initiated'].includes(String(c.status))
    );

    return {
      businesses,
      duplicates,
      stats: {
        mrr: distinct.reduce((s, b) => s + (b.mrr ?? 0), 0),
        active: distinct.filter((b) => b.status === 'active').length,
        total: distinct.length,
        totalRows: businesses.length,
        callsUsed: distinct.reduce((s, b) => s + (b.calls_used ?? 0), 0),
        totalCalls: allCalls.length,
        connectedCalls: connected.length,
        answeredSeconds: allCalls.reduce((s, c) => s + (c.duration_seconds ?? 0), 0),
        hotLeads: allCalls.filter((c) => c.status === 'Hot Lead').length,
      },
      recentCalls: allCalls.slice(0, 20),
    };
  });
}

/** POST /api/business — create a tenant. */
export async function POST(req: Request) {
  const body = await readJson<Partial<Business>>(req);
  if (!body?.name?.trim()) return fail('name is required');
  try {
    return ok({ business: await createBusiness(body) }, { status: 201 });
  } catch (err) {
    return fail('Could not create business', 500, describeError(err).detail);
  }
}

/** PATCH /api/business — { id, ...fields }. Used by Settings for outbound_number etc. */
export async function PATCH(req: Request) {
  const body = await readJson<Partial<Business> & { id?: string }>(req);
  if (!body) return fail('Invalid JSON body');
  try {
    const target = body.id ? await getBusiness(body.id) : await getBusiness();
    if (!target) return fail('No business found', 404);
    const { id: _ignored, ...patch } = body;
    void _ignored;
    return ok({ business: await updateBusiness(target.id, patch) });
  } catch (err) {
    return fail('Could not update business', 500, describeError(err).detail);
  }
}
