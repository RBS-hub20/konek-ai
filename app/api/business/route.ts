import { createBusiness, getBusiness, listBusinesses, updateBusiness } from '@/lib/server/repo';
import type { BusinessRow } from '@/lib/types';
import { fail, handle, ok, readJson } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** GET /api/business            → every tenant (super admin)
 *  GET /api/business?id=<uuid>  → one tenant
 *  GET /api/business?current=1  → the first/demo tenant (owner dashboard) */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  return handle(async () => {
    if (p.get('id')) return { business: await getBusiness(p.get('id')!) };
    if (p.get('current')) return { business: await getBusiness() };
    const businesses = await listBusinesses();
    return {
      businesses,
      stats: {
        mrr: businesses.reduce((s, b) => s + (b.mrr ?? 0), 0),
        active: businesses.filter((b) => b.status === 'active' || b.status === 'trial').length,
        total: businesses.length,
        callsUsed: businesses.reduce((s, b) => s + (b.calls_used ?? 0), 0),
      },
    };
  });
}

/** POST /api/business — create a tenant. */
export async function POST(req: Request) {
  const body = await readJson<Partial<BusinessRow>>(req);
  if (!body?.name) return fail('name is required');
  if (!body.owner_email) return fail('owner_email is required');
  try {
    return ok({ business: await createBusiness(body) }, { status: 201 });
  } catch (err) {
    return fail('Could not create business', 500, err instanceof Error ? err.message : String(err));
  }
}

/** PATCH /api/business — { id, ...fields } update a tenant. */
export async function PATCH(req: Request) {
  const body = await readJson<Partial<BusinessRow> & { id?: string }>(req);
  if (!body?.id) return fail('id is required');
  const { id, ...patch } = body;
  try {
    return ok({ business: await updateBusiness(id, patch) });
  } catch (err) {
    return fail('Could not update business', 500, err instanceof Error ? err.message : String(err));
  }
}
