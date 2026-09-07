import { createBusiness, getSalesTenant, listBusinesses, safe, updateBusiness } from '@/lib/server/tenant';
import { env, hasTwilio } from '@/lib/env';
import { describeError, fail, ok, readJson } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** GET — the tenant the sales desk dials as, if there is one. */
export async function GET() {
  const tenant = await safe(() => getSalesTenant(), null);
  return ok({ salesTenant: tenant });
}

/**
 * POST /api/super-admin/sales-tenant — { number?, name?, email? }
 *
 * Creates the KONEK AI tenant the sales desk calls as, or marks an existing
 * one. It exists because the number pool could only assign a number to a
 * tenant that already existed, and the tenant KONEK AI wanted to assign it
 * to was the one it could not create.
 *
 * Assigning the number here also points its Twilio voice webhook at
 * /api/call/inbound, so a prospect who rings back reaches the closer rather
 * than a Twilio error message.
 */
export async function POST(req: Request) {
  const body = await readJson<{ number?: string; name?: string; email?: string; businessId?: string }>(req);
  const number = body?.number?.trim() || null;

  try {
    /* Only one tenant is the desk. Marking a second demotes the first rather
       than leaving two and picking whichever sorts first. */
    const current = await safe(() => getSalesTenant(), null);

    const all = await safe(() => listBusinesses(), []);
    const digits = (n: string) => n.replace(/\D/g, '');

    /* Adopt before creating. Duplicate tenants have been a recurring problem
       here, and a second "KONEK AI" is exactly what would happen when someone
       makes one on the New business form and then marks the line. */
    let tenant =
      (body?.businessId ? all.find((b) => b.id === body.businessId) : null)
      ?? current
      ?? (number ? all.find((b) => b.outbound_number && digits(b.outbound_number) === digits(number)) : null)
      ?? all.find((b) => b.slug === 'konek-ai' || /^konek\s*ai$/i.test(b.name.trim()))
      ?? null;

    if (tenant) {
      tenant = await updateBusiness(tenant.id, {
        sales_tenant: true,
        ...(number ? { outbound_number: number } : {}),
      });
    } else {
      tenant = await createBusiness({
        name: body?.name?.trim() || 'KONEK AI',
        slug: 'konek-ai',
        owner_email: body?.email?.trim() || 'sales@konek-ai.com',
        industry: 'saas',
        country: 'PH',
        plan: 'starter',
        calls_limit: 500,
        mrr: 0,
        active_vibe: 'PRO_CLOSER',
        language: 'EN',
        billing_interval: 'monthly',
        subscription_status: 'none',
        sales_tenant: true,
        outbound_number: number,
      });
    }

    if (current && current.id !== tenant.id) {
      await safe(() => updateBusiness(current.id, { sales_tenant: false }), null);
    }

    /* Point the number at the callback script. Best effort — the tenant is
       already created, and a webhook that did not stick is worth reporting
       rather than rolling all of that back. */
    let webhook: string | null = null;
    let webhookError: string | null = null;
    if (number && hasTwilio) {
      const res = await pointWebhook(number);
      webhook = res.ok ? res.url : null;
      webhookError = res.ok ? null : res.error;
    }

    return ok({ salesTenant: tenant, webhook, ...(webhookError ? { webhookError } : {}) }, { status: 201 });
  } catch (err) {
    return fail('Could not set up the sales tenant', 500, describeError(err).detail);
  }
}

/** Sets the number's voice webhook so inbound calls reach the closer. */
async function pointWebhook(number: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const url = `${env.appUrl}/api/call/inbound`;
  try {
    const { default: Twilio } = await import('twilio');
    const client = Twilio(env.twilioSid, env.twilioToken);
    const digits = (n: string) => n.replace(/\D/g, '');
    const owned = await client.incomingPhoneNumbers.list({ limit: 100 });
    const match = owned.find((n) => digits(n.phoneNumber) === digits(number));
    if (!match) return { ok: false, error: `${number} is not on this Twilio account.` };
    await client.incomingPhoneNumbers(match.sid).update({ voiceUrl: url, voiceMethod: 'POST' });
    console.log(`[SalesTenant] ${number} inbound webhook → ${url}`);
    return { ok: true, url };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
