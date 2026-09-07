import { createBusiness, getBusiness, safe, updateBusiness } from '@/lib/server/tenant';
import { normalizePhone } from '@/lib/server/phone';
import { TRIAL_DAYS } from '@/lib/trial';
import { describeError, fail, ok, readJson } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/trial/start — the end of the funnel.
 *
 * Takes what onboarding collected and puts the tenant into a trial: their
 * details saved, the wizard marked finished, and a clock started.
 *
 * It writes to the tenant the dashboard already reads — the first business
 * row — because that is the only tenant this dashboard knows how to show.
 * There is no per-user tenancy and no sign-in behind this yet, so it is not
 * a way to reach *another* tenant's data; it is the same single tenant the
 * dashboard has always operated on.
 */
export async function POST(req: Request) {
  const body = await readJson<{
    businessName?: string; industry?: string; country?: string; phone?: string;
    ownerName?: string; ownerEmail?: string; whatYouSell?: string; goal?: string;
    language?: string; vibe?: string; handoffNumber?: string; callId?: string;
  }>(req);

  const name = body?.businessName?.trim();
  if (!name) return fail('A business name is required.');

  /* The owner's own number is where a hot caller gets transferred, so a
     malformed one is worth catching here rather than mid-call. */
  let handoff: string | null = null;
  if (body?.handoffNumber?.trim()) {
    const n = normalizePhone(body.handoffNumber, body.country ?? null);
    if (!n.valid || !n.e164) return fail(n.reason ?? `"${body.handoffNumber}" is not a number Cindy can transfer to.`);
    handoff = n.e164;
  }

  const startedAt = new Date();
  const endsAt = new Date(startedAt.getTime() + TRIAL_DAYS * 864e5);

  const patch = {
    name,
    industry: body?.industry?.trim() || null,
    country: body?.country?.trim()?.toUpperCase() || null,
    owner_name: body?.ownerName?.trim() || null,
    owner_email: body?.ownerEmail?.trim() || null,
    language: body?.language?.trim() || (body?.country?.toUpperCase() === 'PH' ? 'TAGLISH' : 'EN'),
    active_vibe: body?.vibe?.trim() || 'PRO_CLOSER',
    handoff_number: handoff,
    handoff_enabled: Boolean(handoff),
    onboarded_at: startedAt.toISOString(),
    trial_started_at: startedAt.toISOString(),
    trial_ends_at: endsAt.toISOString(),
    subscription_status: 'trialing',
    trial_phone: body?.phone?.trim() || null,
    trial_call_id: body?.callId?.trim() || null,
  };

  try {
    const existing = await safe(() => getBusiness(), null);
    const business = existing
      ? await updateBusiness(existing.id, patch)
      : await createBusiness(patch);

    return ok(
      {
        success: true,
        business,
        trial: {
          days: TRIAL_DAYS,
          startedAt: patch.trial_started_at,
          endsAt: patch.trial_ends_at,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    return fail('Could not start the trial', 500, describeError(err).detail);
  }
}
