import {
  bumpCampaign, getBrain, getCampaign, incrementCallsUsed, listCallLogs,
  listSkills, logCall, resolveBusinessForCall, safe, updateContactStatus,
} from '@/lib/server/tenant';
import { buildCallPrompt, buildOpener } from '@/lib/ai/callPrompt';
import { vibeConfig } from '@/lib/ai/vibes';
import { vibeToKey } from '@/lib/types2';
import { env, hasTwilio, hasCartesia, hasDeepgram } from '@/lib/env';
import { guardCall, isValidPhone, toE164 } from '@/lib/server/operator';
import { SCHEMA_HINT } from '@/lib/server/resilient';
import { describeError, fail, handle, ok, readJson } from '@/lib/server/http';
import type { BusinessBrain, SkillRecord } from '@/lib/types2';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface CallBody {
  to?: string;
  customerPhone?: string;
  phone?: string;
  customerName?: string;
  name?: string;
  business_id?: string;
  businessId?: string;
  campaign_id?: string;
  campaignId?: string;
  contact_id?: string;
  vibe?: string;
  skills?: string[];
  dryRun?: boolean;
}

/** GET /api/call?businessId=&limit= — the call log. */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  return handle(async () => {
    const { business } = await resolveBusinessForCall(p.get('businessId'));
    const calls = await safe(
      () => listCallLogs(business.id, Math.min(Number(p.get('limit') ?? 100) || 100, 500)),
      []
    );
    return { calls, businessId: business.id };
  });
}

/**
 * POST /api/call — place a call.
 *
 * Ordering matters: the phone rings FIRST, then we write the log. A database
 * that is missing a table or a column can therefore never stop a call from
 * connecting — it only downgrades what we can record about it.
 */
export async function POST(req: Request) {
  const guard = guardCall(req);
  if (!guard.ok) {
    return Response.json(
      { error: guard.message, ...(guard.needsUnlock ? { needsUnlock: true } : {}) },
      { status: guard.status }
    );
  }

  const body = await readJson<CallBody>(req);
  if (!body) return fail('Invalid JSON body');

  const rawPhone = (body.to ?? body.customerPhone ?? body.phone ?? '').trim();
  if (!rawPhone) return fail('to (phone number) is required');
  if (!isValidPhone(rawPhone)) {
    return fail(`"${rawPhone}" is not a valid phone number. Use international format, e.g. +639214878257.`);
  }
  const phone = toE164(rawPhone);
  const customerName = (body.customerName ?? body.name ?? '').trim() || null;

  /* ── 1 · Tenant — never throws, never blocks ──────────────────── */
  const { business, ephemeral, note } = await resolveBusinessForCall(
    body.business_id ?? body.businessId ?? null
  );
  const warnings: string[] = [];
  if (note) warnings.push(note);

  if (business.status !== 'active') {
    return fail(`Business "${business.name}" is ${business.status}. Reactivate it to place calls.`, 403);
  }
  if (!ephemeral && business.calls_used >= business.calls_limit) {
    return fail(
      `Call limit reached (${business.calls_used}/${business.calls_limit}). Upgrade the plan to continue.`,
      402
    );
  }

  /* The tenant's own number wins; the env var is the fallback. */
  const from = business.outbound_number?.trim() || env.twilioNumber;
  if (hasTwilio && !from) {
    return fail('No outbound number. Set one in Settings or TWILIO_PHONE_NUMBER.', 400);
  }

  /* ── 2 · Context — all best-effort ────────────────────────────── */
  const campaignId = body.campaign_id ?? body.campaignId ?? null;
  const campaign = campaignId ? await safe(() => getCampaign(campaignId), null) : null;
  const vibe = vibeToKey(body.vibe ?? campaign?.vibe ?? business.active_vibe ?? 'PRO_CLOSER');

  const brain = await safe<BusinessBrain | null>(() => getBrain(business.id), null);
  const allSkills = await safe<SkillRecord[]>(() => listSkills(business.id), []);

  const wanted = body.skills?.length ? body.skills : campaign?.skills?.length ? campaign.skills : null;
  const skills = wanted
    ? allSkills.filter((s) => wanted.includes(s.id))
    : allSkills.filter((s) => s.is_active);

  const systemPrompt = buildCallPrompt({ business, brain, skills, vibe, customerName });
  const opener = buildOpener(business, brain, vibe, customerName);

  if (body.dryRun) {
    return ok({
      dryRun: true, business: business.name, from, to: phone, vibe,
      skillsUsed: skills.map((s) => s.id), goal: brain?.goal ?? 'Book',
      promptChars: systemPrompt.length, opener, systemPrompt,
      ...(warnings.length ? { warnings } : {}),
    });
  }

  /* ── 3 · Dial ─────────────────────────────────────────────────── */
  let twilioSid: string | null = null;
  let status = 'Initiated';
  let mock = true;

  if (hasTwilio) {
    try {
      const { default: Twilio } = await import('twilio');
      const client = Twilio(env.twilioSid, env.twilioToken);
      const call = await client.calls.create({
        to: phone,
        from: from!,
        twiml: buildTwiml(opener, vibe),
        statusCallback: `${env.appUrl}/api/call/transcript`,
        statusCallbackEvent: ['initiated', 'answered', 'completed'],
        statusCallbackMethod: 'POST',
      });
      twilioSid = call.sid;
      status = 'Connected';
      mock = false;
    } catch (err) {
      /* Return Twilio's own error verbatim — never disguise it as a DB problem. */
      const t = err as { message?: string; code?: number | string; moreInfo?: string; status?: number };
      await safe(
        () => logCall({
          business_id: ephemeral ? null : business.id, campaign_id: campaignId,
          contact_id: body.contact_id ?? null, phone, from_number: from ?? null,
          customer_name: customerName, vibe, status: 'Failed',
          skills_used: skills.map((s) => s.id),
        }),
        { id: null, dropped: [], error: null }
      );
      return Response.json(
        {
          success: false,
          error: 'Twilio rejected the call',
          twilioError: t.message ?? describeError(err).detail,
          twilioCode: t.code ?? null,
          moreInfo: t.moreInfo ?? null,
          from, to: phone,
          hint: twilioHint(t.code),
        },
        { status: 502 }
      );
    }
  } else {
    warnings.push('Twilio is not configured — the call was logged but nobody was dialled.');
  }

  /* ── 4 · Record it — best effort, after the phone is already ringing ── */
  const logged = await safe(
    () => logCall({
      business_id: ephemeral ? null : business.id,
      campaign_id: campaignId,
      contact_id: body.contact_id ?? null,
      phone,
      from_number: from ?? null,
      customer_name: customerName,
      vibe,
      status,
      skills_used: skills.map((s) => s.id),
      twilio_sid: twilioSid,
    }),
    { id: null, dropped: [] as string[], error: 'logging skipped' }
  );

  if (logged.error) warnings.push(`Call placed, but not logged: ${logged.error} ${SCHEMA_HINT}`);
  else if (logged.dropped.length) {
    warnings.push(`Logged without ${logged.dropped.join(', ')} — that column is not in call_logs yet. ${SCHEMA_HINT}`);
  }

  if (!ephemeral) {
    await safe(() => incrementCallsUsed(business.id), undefined);
    if (campaignId) await safe(() => bumpCampaign(campaignId, 'called_count'), undefined);
    if (body.contact_id) await safe(() => updateContactStatus(body.contact_id!, 'Called'), undefined);
  }

  return ok(
    {
      success: true,
      callId: logged.id,
      twilioSid,
      status,
      mock,
      from,
      to: phone,
      vibe,
      business: business.name,
      skillsUsed: skills.map((s) => s.id),
      promptChars: systemPrompt.length,
      services: { twilio: hasTwilio, cartesia: hasCartesia, deepgram: hasDeepgram },
      ...(warnings.length ? { warnings } : {}),
    },
    { status: 201 }
  );
}

/**
 * TwiML executed when the customer answers.
 *
 * Without a media-stream bridge this speaks the opener in a voice matched to
 * the vibe, then hangs up. Replace with <Connect><Stream/></Connect> once the
 * websocket bridge exists.
 */
function buildTwiml(opener: string, vibe: string): string {
  const v = vibeConfig(vibe);
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Response>` +
    `<Say voice="${v.twilioVoice}">${escapeXml(opener)}</Say>` +
    `<Pause length="1"/>` +
    `<Say voice="${v.twilioVoice}">${escapeXml('Thanks for taking my call. Someone from the team will follow up shortly. Have a great day!')}</Say>` +
    `</Response>`
  );
}

/** Turns the common Twilio error codes into something actionable. */
function twilioHint(code: number | string | undefined | null): string | undefined {
  switch (String(code)) {
    case '21211': return 'The destination number is not valid in E.164 format.';
    case '21214': return 'Twilio could not route to this number — it may be unreachable or the geo permission is off.';
    case '21215': return 'Geo permissions: enable the destination country in Twilio Console → Voice → Geographic Permissions.';
    case '21606': return 'The "from" number is not a Twilio number on this account, or is not voice-enabled.';
    case '21610': return 'That number is unsubscribed from this account.';
    case '20003': return 'Twilio authentication failed — check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.';
    case '21219':
    case '21608': return 'Trial account: verify the destination number in Twilio Console → Verified Caller IDs, or upgrade.';
    default: return undefined;
  }
}

function escapeXml(s: string) {
  return s.replace(/[<>&"']/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c] ?? c
  );
}
