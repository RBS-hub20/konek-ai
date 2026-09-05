import { getBusinessForRead, getLead, pickScript, safe, updateLead } from '@/lib/server/tenant';
import { renderScript, type OutboundScript } from '@/lib/types2';
import { env, hasTwilio, hasMediaBridge } from '@/lib/env';
import { guardCall } from '@/lib/server/operator';
import { normalizePhone } from '@/lib/server/phone';
import { describeError, fail, ok, readJson } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/leads/call — { leadId }
 *
 * Cindy calls a sales lead. Same engine as a tenant call, but the context is
 * KONEK selling itself, so the pitch and the transfer target differ.
 */
export async function POST(req: Request) {
  const guard = guardCall(req);
  if (!guard.ok) {
    return Response.json(
      { error: guard.message, ...(guard.needsUnlock ? { needsUnlock: true } : {}) },
      { status: guard.status }
    );
  }

  const body = await readJson<{ leadId?: string }>(req);
  if (!body?.leadId) return fail('leadId is required');

  try {
    const lead = await getLead(body.leadId);
    if (!lead) return fail('Lead not found', 404);
    const n = normalizePhone(lead.phone, lead.country);
    if (!n.valid || !n.e164) return fail(n.reason ?? `Lead phone "${lead.phone}" is not valid.`);
    const phone = n.e164;
    const { business } = await getBusinessForRead(null);
    const from = business.outbound_number?.trim() || env.twilioNumber;
    if (hasTwilio && !from) return fail('No outbound number configured.', 400);

    /* Country decides the language Cindy opens in. */
    const language = lead.country === 'AE' || lead.country === 'SA' || lead.country === 'QA'
      ? 'EN'
      : lead.country === 'PH' ? 'TAGLISH' : 'EN';

    /* A written opener read at a steady pace is far easier to follow on a
       phone line than one the model improvises. */
    const script = await safe(() => pickScript(lead.industry, lead.country), null);
    const vars = {
      company: lead.company ?? 'your business',
      contact: lead.contact_person ?? '',
      industry: lead.industry ?? 'business',
    };
    const opener = openerFrom(script, lead.country, vars);

    let twilioSid: string | null = null;
    let status = 'Calling';
    let warning: string | undefined;

    if (hasTwilio) {
      try {
        const { default: Twilio } = await import('twilio');
        const client = Twilio(env.twilioSid, env.twilioToken);
        const call = await client.calls.create({
          to: phone,
          from: from!,
          twiml: outboundTwiml({
            company: lead.company, contact: lead.contact_person, language,
            scriptId: script?.id ?? null, opener,
            speed: script?.voice_settings?.speed ?? null,
          }),
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
            error: 'Twilio rejected the call',
            twilioError: t.message,
            twilioCode: t.code ?? null,
            hint: twilioHint(t.code, lead.country),
          },
          { status: 502 }
        );
      }
    } else {
      warning = 'Twilio is not configured — the lead was marked as called but nobody was dialled.';
    }

    const updated = await updateLead(lead.id, {
      status,
      call_count: (lead.call_count ?? 0) + 1,
      last_called_at: new Date().toISOString(),
      twilio_sid: twilioSid,
    });

    return ok(
      {
        success: true,
        lead: updated,
        twilioSid,
        from,
        to: phone,
        language,
        script: script ? { id: script.id, name: script.name, speed: script.voice_settings.speed } : null,
        opener,
        mode: hasMediaBridge ? 'conversation' : 'opener-only',
        ...(warning ? { warning } : {}),
      },
      { status: 201 }
    );
  } catch (err) {
    return fail('Could not call the lead', 500, describeError(err).detail);
  }
}

/** The Twilio failures that actually happen when dialling internationally. */
function twilioHint(code: number | string | undefined | null, country: string | null): string | undefined {
  const where = country ? `${country} ` : '';
  switch (String(code)) {
    case '21215':
    case '21216':
      return `Calls to ${where}are blocked. Enable the country in Twilio Console → Voice → Geographic Permissions, then try again.`;
    case '21211':
      return 'The number is not valid E.164. Re-add the lead with its country selected.';
    case '21606':
      return 'The outbound number is not a voice-enabled Twilio number on this account.';
    case '20003':
      return 'Twilio authentication failed — check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.';
    case '21219':
    case '21608':
      return 'Trial account: verify this number in Twilio Console → Verified Caller IDs, or upgrade.';
    default:
      return undefined;
  }
}

/** The opener for this lead, from the script, in the right column. */
function openerFrom(
  script: OutboundScript | null,
  country: string | null,
  vars: Record<string, string>
): string {
  const step = script?.script_steps?.find((s) => s.step === 'opener');
  if (step) {
    const text = country === 'PH' ? step.text_ph : step.text_ae || step.text_ph;
    const rendered = renderScript(text, vars);
    if (rendered) return rendered;
  }
  const who = vars.contact ? `${vars.contact}, ` : '';
  return `Good morning ${who}this is Cindy, from Konek A I. Do you have thirty seconds?`;
}

/**
 * Cindy's outbound TwiML. With the bridge configured this hands the call to
 * the media stream, which reads the script; without it, the opener is spoken
 * directly so the call is still intelligible.
 */
function outboundTwiml(o: {
  company: string | null; contact: string | null; language: string;
  scriptId: string | null; opener: string; speed: number | null;
}): string {
  if (hasMediaBridge) {
    const params = [
      ['outbound', 'sales'],
      ['company', o.company ?? ''],
      ['contact', o.contact ?? ''],
      ['language', o.language],
      ['vibe', 'PRO_CLOSER'],
      ['scriptId', o.scriptId ?? ''],
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
    `<Say voice="Polly.Joanna-Neural">${escapeXml('I will have a colleague follow up. Thank you for your time.')}</Say>` +
    `</Response>`
  );
}

function escapeXml(s: string) {
  return String(s).replace(/[<>&"']/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c] ?? c
  );
}
