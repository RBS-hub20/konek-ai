import { getSalesSettings, saveSalesSettings } from '@/lib/server/tenant';
import type { SalesSettings } from '@/lib/types2';
import { normalizePhone } from '@/lib/server/phone';
import { describeError, fail, handle, ok, readJson } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * The numbers an interested lead is transferred to. Platform-wide rather than
 * per-tenant: these calls are KONEK selling itself, not a tenant's customers.
 */
export async function GET() {
  return handle(async () => ({ sales: await getSalesSettings() }));
}

export async function POST(req: Request) {
  const body = await readJson<Partial<SalesSettings>>(req);
  if (!body) return fail('Invalid JSON body');

  const patch: Partial<SalesSettings> = {};
  for (const key of ['manager_number', 'backup_number'] as const) {
    if (!(key in body)) continue;
    const raw = (body[key] ?? '').toString().trim();
    if (!raw) { patch[key] = null; continue; }
    const n = normalizePhone(raw);
    if (!n.valid || !n.e164) return fail(n.reason ?? `"${raw}" is not a valid phone number.`);
    patch[key] = n.e164;
  }
  if (typeof body.whisper === 'boolean') patch.whisper = body.whisper;

  try {
    return ok({ sales: await saveSalesSettings(patch) });
  } catch (err) {
    return fail('Could not save sales numbers', 500, describeError(err).detail);
  }
}
