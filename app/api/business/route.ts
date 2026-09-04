import { createBusiness, getBusiness, listBusinesses, listCallLogs, updateBusiness } from '@/lib/server/tenant';
import type { Business } from '@/lib/types2';
import { fail, handle, ok, readJson } from '@/lib/server/http';

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

    const businesses = await listBusinesses();
    const allCalls = await listCallLogs(null, 500);
    return {
      businesses,
      stats: {
        mrr: businesses.reduce((s, b) => s + (b.mrr ?? 0), 0),
        active: businesses.filter((b) => b.status === 'active').length,
        total: businesses.length,
        callsUsed: businesses.reduce((s, b) => s + (b.calls_used ?? 0), 0),
        totalCalls: allCalls.length,
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
    return fail('Could not create business', 500, err instanceof Error ? err.message : String(err));
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
    return fail('Could not update business', 500, err instanceof Error ? err.message : String(err));
  }
}
