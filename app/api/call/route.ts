import {
  bumpCampaign, getBrain, getCampaign, incrementCallsUsed, listCallLogs,
  listSkills, logCall, resolveBusinessForCall, safe, updateContactStatus,
} from '@/lib/server/tenant';
import { buildCallPrompt, buildOpener } from '@/lib/ai/callPrompt';
import { vibeConfig } from '@/lib/ai/vibes';
import { vibeToKey } from '@/lib/types2';
import { env, hasTwilio, hasCartesia, hasDeepgram, hasMediaBridge } from '@/lib/env';
import { languageConfig, languageToKey } from '@/lib/ai/languages';
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
  /** EN | TL | TAGLISH | AR | HI */
  language?: string;
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
  const language = languageToKey(body.language ?? business.language);

  const brain = await safe<BusinessBrain | null>(() => getBrain(business.id), null);
  const allSkills = await safe<SkillRecord[]>(() => listSkills(business.id), []);

  const wanted = body.skills?.length ? body.skills : campaign?.skills?.length ? campaign.skills : null;
  const skills = wanted
    ? allSkills.filter((s) => wanted.includes(s.id))
    : allSkills.filter((s) => s.is_active);

  const systemPrompt = buildCallPrompt({ business, brain, skills, vibe, language, customerName });
  const opener = buildOpener(business, brain, vibe, customerName, language);

  if (body.dryRun) {
    return ok({
      dryRun: true, business: business.name, from, to: phone, vibe, language,
      mode: hasMediaBridge ? 'conversation' : 'opener-only',
      skillsUsed: skills.map((s) => s.id), goal: brain?.goal ?? 'Book',
      promptChars: systemPrompt.length, opener, systemPrompt,
      /* Exactly what Twilio will execute — inspect it without dialling. */
      twiml: buildTwiml({
        opener, vibe, language,
        businessId: ephemeral ? '' : business.id,
        campaignId,
      }),
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
        twiml: buildTwiml({ opener, vibe, language, businessId: ephemeral ? '' : business.id, campaignId }),
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

  if (hasTwilio && !hasMediaBridge) {
    warnings.push(
      'MEDIA_STREAM_URL is not set, so this call speaks the opener and hangs up. Deploy the bridge in ./bridge for a two-way conversation.'
    );
  }
  if (hasMediaBridge && languageConfig(language).fallbackApproximate === undefined) {
    /* no-op: kept so the language import is always exercised */
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
      language,
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
      language,
      mode: hasMediaBridge ? 'conversation' : 'opener-only',
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
 * With MEDIA_STREAM_URL set, the call is handed to the media bridge over a
 * websocket and becomes a real two-way conversation that lasts until someone
 * hangs up. Without it, we fall back to speaking the opener and hanging up,
 * so a missing bridge degrades rather than breaks.
 */
function buildTwiml(opts: {
  opener: string;
  vibe: string;
  language: string;
  businessId: string;
  campaignId: string | null;
}): string {
  const { opener, vibe, language, businessId, campaignId } = opts;

  if (hasMediaBridge) {
    /* Parameters ride along so the bridge knows which tenant, vibe and
       language this call belongs to before the first audio frame. */
    const params = [
      ['businessId', businessId],
      ['vibe', vibe],
      ['language', language],
      ['campaignId', campaignId ?? ''],
    ]
      .filter(([, v]) => v)
      .map(([k, v]) => `<Parameter name="${k}" value="${escapeXml(String(v))}"/>`)
      .join('');

    return (
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<Response>` +
      `<Connect>` +
      `<Stream url="${escapeXml(env.mediaStreamUrl)}">${params}</Stream>` +
      `</Connect>` +
      `</Response>`
    );
  }

  const v = vibeConfig(vibe);
  const lang = languageConfig(language);
  /* Arabic and Hindi have real Polly voices; Tagalog does not, so the fallback
     reads Taglish with an English voice. The bridge removes this limitation. */
  const voice = lang.key === 'EN' ? v.twilioVoice : lang.twilioVoice;

  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Response>` +
    `<Say voice="${voice}" language="${lang.twilioLang}">${escapeXml(opener)}</Say>` +
    `<Pause length="1"/>` +
    `<Say voice="${voice}" language="${lang.twilioLang}">${escapeXml(CLOSING[lang.key])}</Say>` +
    `</Response>`
  );
}

const CLOSING: Record<string, string> = {
  EN: 'Thanks for taking my call. Someone from the team will follow up shortly. Have a great day!',
  TL: 'Maraming salamat po sa oras ninyo. May susunod pong tatawag mula sa team namin. Ingat po kayo!',
  TAGLISH: 'Thank you po sa time ninyo. May mag-follow up po sa inyo from our team. Ingat po!',
  AR: 'شكراً لوقتك. سيتواصل معك أحد أفراد الفريق قريباً. أتمنى لك يوماً سعيداً!',
  HI: 'आपके समय के लिए धन्यवाद। हमारी टीम से कोई जल्द ही संपर्क करेगा। आपका दिन शुभ हो!',
};

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
