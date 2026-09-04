import {
  bumpCampaign, createCallLog, getBrain, getBusiness, getCampaign,
  incrementCallsUsed, listCallLogs, listSkills, updateContactStatus,
} from '@/lib/server/tenant';
import { buildCallPrompt, buildOpener } from '@/lib/ai/callPrompt';
import { vibeConfig } from '@/lib/ai/vibes';
import { vibeToKey } from '@/lib/types2';
import { env, hasTwilio, hasCartesia, hasDeepgram } from '@/lib/env';
import { guardCall, isValidPhone, toE164 } from '@/lib/server/operator';
import { fail, handle, ok, readJson } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface CallBody {
  /* `to` and `customerPhone` are both accepted. */
  to?: string;
  customerPhone?: string;
  customerName?: string;
  business_id?: string;
  businessId?: string;
  campaign_id?: string;
  campaignId?: string;
  contact_id?: string;
  vibe?: string;
  skills?: string[];
  /** Assemble the prompt and return it without dialling anyone. */
  dryRun?: boolean;
}

/** GET /api/call?businessId=&limit= — the call log. */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  return handle(async () => {
    const business = await getBusiness(p.get('businessId'));
    const calls = await listCallLogs(business?.id ?? null, Math.min(Number(p.get('limit') ?? 100) || 100, 500));
    return { calls, businessId: business?.id ?? null };
  });
}

/**
 * POST /api/call — place a call.
 *
 *  1. Resolve the tenant and its outbound number (DB first, env as fallback)
 *  2. Load Business Brain + that tenant's active skills + the vibe
 *  3. Assemble one system prompt — the Brain is the only source of facts
 *  4. Dial through Twilio from the tenant's own number
 *  5. Write a call_logs row, count it against the plan, bump the campaign
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

  const rawPhone = (body.to ?? body.customerPhone ?? '').trim();
  if (!rawPhone) return fail('to (phone number) is required');
  if (!isValidPhone(rawPhone)) return fail(`"${rawPhone}" is not a valid phone number. Use international format, e.g. +971501184402.`);
  const phone = toE164(rawPhone);

  try {
    /* ── 1 · Tenant ───────────────────────────────────────────────── */
    const business = await getBusiness(body.business_id ?? body.businessId ?? null);
    if (!business) return fail('No business found. Create one first via POST /api/business.', 404);

    if (business.status !== 'active') {
      return fail(`Business "${business.name}" is ${business.status}. Reactivate it to place calls.`, 403);
    }
    if (business.calls_used >= business.calls_limit) {
      return fail(
        `Call limit reached (${business.calls_used}/${business.calls_limit}). Upgrade the plan to continue.`,
        402
      );
    }

    /* The tenant's own number wins; the env var is only a fallback. */
    const from = business.outbound_number?.trim() || env.twilioNumber;
    if (hasTwilio && !from) {
      return fail('This business has no outbound number. Set one in Settings.', 400);
    }

    /* ── 2 · Context ──────────────────────────────────────────────── */
    const campaignId = body.campaign_id ?? body.campaignId ?? null;
    const campaign = campaignId ? await getCampaign(campaignId) : null;
    const vibe = vibeToKey(body.vibe ?? campaign?.vibe ?? business.active_vibe ?? 'PRO_CLOSER');

    const [brain, allSkills] = await Promise.all([getBrain(business.id), listSkills(business.id)]);

    const wanted = body.skills?.length ? body.skills : campaign?.skills?.length ? campaign.skills : null;
    const skills = wanted
      ? allSkills.filter((s) => wanted.includes(s.id))
      : allSkills.filter((s) => s.is_active);

    /* ── 3 · Prompt ───────────────────────────────────────────────── */
    const systemPrompt = buildCallPrompt({
      business, brain, skills, vibe, customerName: body.customerName ?? null,
    });
    const opener = buildOpener(business, brain, vibe, body.customerName ?? null);

    if (body.dryRun) {
      return ok({
        dryRun: true, business: business.name, from, to: phone, vibe,
        skillsUsed: skills.map((s) => s.id),
        goal: brain?.goal ?? 'Book',
        promptChars: systemPrompt.length, opener, systemPrompt,
      });
    }

    /* ── 4 · Dial ─────────────────────────────────────────────────── */
    let twilioSid: string | null = null;
    let status = 'Initiated';
    let mock = true;
    let warning: string | undefined;

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
        status = 'Failed';
        warning = err instanceof Error ? err.message : String(err);
      }
    } else {
      warning = 'Twilio is not configured — the call was logged but nobody was dialled.';
    }

    /* ── 5 · Persist ──────────────────────────────────────────────── */
    const log = await createCallLog({
      business_id: business.id,
      campaign_id: campaignId,
      contact_id: body.contact_id ?? null,
      customer_name: body.customerName ?? null,
      phone,
      skills_used: skills.map((s) => s.id),
      vibe,
      status,
      twilio_sid: twilioSid,
    });

    if (status !== 'Failed') {
      await incrementCallsUsed(business.id);
      if (campaignId) await bumpCampaign(campaignId, 'called_count');
      if (body.contact_id) await updateContactStatus(body.contact_id, 'Called');
    }

    return ok(
      {
        success: status !== 'Failed',
        callId: log.id, twilioSid, status, mock,
        from, to: phone, vibe,
        business: business.name,
        skillsUsed: skills.map((s) => s.id),
        promptChars: systemPrompt.length,
        services: { twilio: hasTwilio, cartesia: hasCartesia, deepgram: hasDeepgram },
        ...(warning ? { warning } : {}),
      },
      { status: status === 'Failed' ? 502 : 201 }
    );
  } catch (err) {
    return fail('Could not place call', 500, err instanceof Error ? err.message : String(err));
  }
}

/**
 * The TwiML Twilio executes when the customer answers.
 *
 * Without a media-stream bridge this speaks the opener with a Twilio voice
 * matched to the vibe, then hangs up. Once the websocket bridge exists,
 * swap this for <Connect><Stream url="wss://..."/></Connect>.
 */
function buildTwiml(opener: string, vibe: string): string {
  const v = vibeConfig(vibe);
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Response>` +
    `<Say voice="${v.twilioVoice}">${escapeXml(opener)}</Say>` +
    `<Pause length="1"/>` +
    `<Say voice="${v.twilioVoice}">${escapeXml(
      'Thanks for taking my call. Someone from the team will follow up shortly. Have a great day!'
    )}</Say>` +
    `</Response>`
  );
}

function escapeXml(s: string) {
  return s.replace(/[<>&"']/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c] ?? c
  );
}
