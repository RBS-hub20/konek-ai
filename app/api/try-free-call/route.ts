import {
  createLead, getBusinessForRead, logCall, pickScript, safe, updateLead,
} from '@/lib/server/tenant';
import { buildOpenerLine, languageModeFor, speedFor } from '@/lib/voice/cindyReceptionist';
import { normalizePhone } from '@/lib/server/phone';
import { env, hasTwilio, hasMediaBridge } from '@/lib/env';
import { describeError, fail, ok, readJson } from '@/lib/server/http';
import { checkTrialGate, markTrialCall } from '@/lib/server/trialGate';
import type { OutboundScript } from '@/lib/types2';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/try-free-call — { businessName, phone, industry }
 *
 * The hook on the landing page: Cindy rings the visitor's own phone within
 * seconds, with no account and nothing to fill in afterwards.
 *
 * Deliberately unauthenticated, which is the whole point, so it is also the
 * only endpoint here that dials a number nobody has verified. Two things keep
 * that from being a way to make this app phone strangers: the number is
 * normalised and must be a real mobile-capable line, and one number gets one
 * call per day.
 *
 * The call itself goes out over Twilio exactly like a sales call — the bridge
 * is a websocket media server and has no way to originate one.
 */
export async function POST(req: Request) {
  const body = await readJson<{ businessName?: string; phone?: string; industry?: string; country?: string }>(req);
  const businessName = body?.businessName?.trim();
  const rawPhone = body?.phone?.trim();
  const industry = body?.industry?.trim() || 'generic';

  if (!businessName) return fail('Tell us the business name so Cindy knows who she is calling about.');
  if (!rawPhone) return fail('A phone number is required.');

  const n = normalizePhone(rawPhone, body?.country ?? null);
  if (!n.valid || !n.e164) return fail(n.reason ?? `"${rawPhone}" is not a number Cindy can dial.`);
  const phone = n.e164;
  const country = (n.country ?? body?.country ?? '').toUpperCase() || null;

  /* One per number per day. Checked before anything is written, so a blocked
     attempt leaves no trace behind. */
  const gate = await checkTrialGate(phone);
  if (!gate.allowed) {
    return Response.json(
      { error: gate.reason, retryAfterHours: gate.retryAfterHours, rateLimited: true },
      { status: 429 }
    );
  }

  try {
    const { business } = await getBusinessForRead(null);
    const from = business.outbound_number?.trim() || env.twilioNumber;
    if (hasTwilio && !from) return fail('No outbound number is configured yet.', 503);

    /* The country decides the script, which decides the language and the
       pace. A Manila number hears Taglish from the first word. */
    const script = await safe<OutboundScript | null>(() => pickScript(industry, country), null);
    const language = country === 'PH' ? 'TAGLISH' : 'EN';
    const mode = languageModeFor(script, country);
    const speed = script ? speedFor(script, mode) : null;

    const opener = buildOpenerLine({
      script, company: businessName, contact: null, industry, country,
    });

    console.log(
      '[TryFreeCall] script:', script?.name ?? '(none)',
      'speed:', speed, 'country:', country, 'language:', language
    );

    /* Recorded before dialling: the lead is what the daily limit is read back
       from, so it has to exist even if Twilio then refuses the call. */
    const lead = await createLead({
      company: businessName,
      contact_person: null,
      phone,
      industry,
      country,
      status: 'Calling',
      is_trial: true,
      notes: 'Try Free Call from the landing page',
    });
    markTrialCall(phone);

    let twilioSid: string | null = null;
    let warning: string | undefined;

    if (hasTwilio) {
      try {
        const { default: Twilio } = await import('twilio');
        const client = Twilio(env.twilioSid, env.twilioToken);
        const call = await client.calls.create({
          to: phone,
          from: from!,
          twiml: trialTwiml({ company: businessName, language, industry, country, scriptId: script?.id ?? null, opener, speed }),
          statusCallback: `${env.appUrl}/api/call/transcript`,
          statusCallbackEvent: ['initiated', 'answered', 'completed'],
          statusCallbackMethod: 'POST',
        });
        twilioSid = call.sid;
      } catch (err) {
        const t = err as { message?: string; code?: number | string };
        await safe(() => updateLead(lead.id, { status: 'No answer' }), null);
        return Response.json(
          {
            success: false,
            error: 'The call could not be placed. Try again in a moment.',
            twilioError: t.message,
            twilioCode: t.code ?? null,
          },
          { status: 502 }
        );
      }
    } else {
      warning = 'Twilio is not configured here, so no phone actually rang.';
    }

    await safe(() => updateLead(lead.id, { twilio_sid: twilioSid, last_called_at: new Date().toISOString(), call_count: 1 }), null);

    const logged = await logCall({
      business_id: business.id,
      phone,
      from_number: from ?? null,
      customer_name: businessName,
      vibe: 'PRO_CLOSER',
      language,
      script_id: script?.id ?? null,
      is_trial: true,
      status: 'Calling',
      twilio_sid: twilioSid,
    });

    return ok(
      {
        success: true,
        /* What the welcome screen polls. */
        callId: logged.id,
        leadId: lead.id,
        twilioSid,
        to: phone,
        country,
        language,
        businessName,
        script: script ? { id: script.id, name: script.name, speed } : null,
        opener,
        mode: hasMediaBridge ? 'conversation' : 'opener-only',
        ...(warning ? { warning } : {}),
      },
      { status: 201 }
    );
  } catch (err) {
    return fail('Could not start the call', 500, describeError(err).detail);
  }
}

/** Same shape the sales calls use, so the demo is the real product. */
function trialTwiml(o: {
  company: string; language: string; industry: string; country: string | null;
  scriptId: string | null; opener: string; speed: number | null;
}): string {
  if (hasMediaBridge) {
    const params = [
      ['outbound', 'trial'],
      ['company', o.company],
      ['language', o.language],
      ['vibe', 'PRO_CLOSER'],
      ['scriptId', o.scriptId ?? ''],
      ['industry', o.industry],
      ['country', o.country ?? ''],
      ['speed', o.speed != null ? String(o.speed) : ''],
    ]
      .filter(([, v]) => v)
      .map(([k, v]) => `<Parameter name="${k}" value="${escapeXml(String(v))}"/>`)
      .join('');
    return (
      `<?xml version="1.0" encoding="UTF-8"?><Response><Connect>` +
      `<Stream url="${escapeXml(env.mediaStreamUrl)}">${params}</Stream>` +
      `</Connect></Response>`
    );
  }

  return (
    `<?xml version="1.0" encoding="UTF-8"?><Response>` +
    `<Say voice="Polly.Joanna-Neural">${escapeXml(o.opener)}</Say>` +
    `<Pause length="1"/>` +
    `<Say voice="Polly.Joanna-Neural">${escapeXml('That was a thirty second demo. Head back to the tab to set me up for your business.')}</Say>` +
    `</Response>`
  );
}

function escapeXml(s: string) {
  return String(s).replace(/[<>&"']/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c] ?? c
  );
}
