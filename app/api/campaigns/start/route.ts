import { getBusiness, getCampaign, listContacts, updateCampaign } from '@/lib/server/tenant';
import { guardCall } from '@/lib/server/operator';
import { env } from '@/lib/env';
import { fail, ok, readJson, describeError } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/* One request per contact, sequential, with a small gap. Twilio rate-limits
   bursts and a campaign of hundreds would blow the function timeout, so each
   run dials at most BATCH contacts and reports what is left. */
const BATCH = 20;
const GAP_MS = 400;

/**
 * POST /api/campaigns/start — { campaignId, businessId? }
 * Dials the campaign's pending contacts through /api/call.
 */
export async function POST(req: Request) {
  const guard = guardCall(req);
  if (!guard.ok) {
    return Response.json(
      { error: guard.message, ...(guard.needsUnlock ? { needsUnlock: true } : {}) },
      { status: guard.status }
    );
  }

  const body = await readJson<{ campaignId?: string; businessId?: string; limit?: number }>(req);
  if (!body?.campaignId) return fail('campaignId is required');

  try {
    const [business, campaign] = await Promise.all([
      getBusiness(body.businessId),
      getCampaign(body.campaignId),
    ]);
    if (!business) return fail('No business found', 404);
    if (!campaign) return fail('Campaign not found', 404);

    const contacts = await listContacts(campaign.id);
    const pending = contacts.filter((c) => c.status === 'Pending');
    if (!pending.length) {
      await updateCampaign(campaign.id, { status: 'Completed' });
      return ok({ started: 0, remaining: 0, status: 'Completed', note: 'No pending contacts left.' });
    }

    const room = Math.max(0, business.calls_limit - business.calls_used);
    if (room === 0) return fail(`Call limit reached (${business.calls_used}/${business.calls_limit}).`, 402);

    const take = pending.slice(0, Math.min(body.limit ?? BATCH, BATCH, room));
    await updateCampaign(campaign.id, { status: 'Running' });

    const results: { contactId: string; phone: string; ok: boolean; error?: string }[] = [];

    for (const contact of take) {
      try {
        const res = await fetch(`${env.appUrl}/api/call`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            /* Server-to-server, so the machine key is the right credential. */
            ...(env.apiSecret ? { 'x-konek-key': env.apiSecret } : {}),
          },
          body: JSON.stringify({
            to: contact.phone,
            customerName: contact.name,
            business_id: business.id,
            campaign_id: campaign.id,
            contact_id: contact.id,
            vibe: campaign.vibe,
            skills: campaign.skills?.length ? campaign.skills : undefined,
          }),
        });
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        results.push({ contactId: contact.id, phone: contact.phone, ok: res.ok, error: res.ok ? undefined : json.error });
      } catch (err) {
        results.push({
          contactId: contact.id, phone: contact.phone, ok: false,
          error: describeError(err).detail,
        });
      }
      if (GAP_MS) await new Promise((r) => setTimeout(r, GAP_MS));
    }

    const after = await listContacts(campaign.id);
    const remaining = after.filter((c) => c.status === 'Pending').length;
    if (remaining === 0) await updateCampaign(campaign.id, { status: 'Completed' });

    return ok({
      started: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      remaining,
      status: remaining === 0 ? 'Completed' : 'Running',
      results,
      ...(remaining > 0 ? { note: `Dialled ${take.length} this run. Press Start again for the next ${BATCH}.` } : {}),
    });
  } catch (err) {
    return fail('Could not start campaign', 500, describeError(err).detail);
  }
}
