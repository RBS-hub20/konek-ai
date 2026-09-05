import { getBusinessForRead, getLead, getScript, logCall, pickScript, safe, updateLead } from '@/lib/server/tenant';
import { type OutboundScript } from '@/lib/types2';
import { buildOpenerLine, languageModeFor, speedFor } from '@/lib/voice/cindyReceptionist';
import { env, hasTwilio, hasMediaBridge } from '@/lib/env';
import { guardCall } from '@/lib/server/operator';
import { normalizePhone } from '@/lib/server/phone';
import { describeError, fail, ok, readJson } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/leads/call — { leadId, scriptId? }
 *
 * Cindy calls a sales lead. Same engine as a tenant call, but the context is
 * KONEK selling itself, so the pitch and the transfer target differ.
 *
 * scriptId is the script the operator had open in Script Studio. Whoever set
 * the call up chose that script, so it wins outright — no re-ranking by the
 * lead's industry, and no falling back to the tenant's own receptionist
 * prompt. Without it (a call from the business dashboard) the best-matching
 * default is picked as before.
 */
export async function POST(req: Request) {
  const guard = guardCall(req);
  if (!guard.ok) {
    return Response.json(
      { error: guard.message, ...(guard.needsUnlock ? { needsUnlock: true } : {}) },
      { status: guard.status }
    );
  }

  const body = await readJson<{ leadId?: string; scriptId?: string | null; script_id?: string | null }>(req);
  if (!body?.leadId) return fail('leadId is required');
  const chosenScriptId = (body.scriptId ?? body.script_id ?? null)?.trim() || null;

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
    let script: OutboundScript | null = null;
    let scriptSource: 'selected' | 'auto' = 'auto';
    if (chosenScriptId) {
      script = await safe(() => getScript(chosenScriptId), null);
      /* Refusing beats quietly dialling with a different script than the one
         on screen — that is the bug this parameter exists to fix. */
      if (!script) return fail('That script no longer exists. Reload Script Studio and pick one again.', 404);
      if (script.is_active === false) return fail(`“${script.name}” is switched off. Turn it on or pick another script.`);
      scriptSource = 'selected';
    } else {
      script = await safe(() => pickScript(lead.industry, lead.country), null);
    }

    const mode = languageModeFor(script, lead.country);
    const speed = script ? speedFor(script, mode) : null;
    console.log(
      '[Outbound] Super Admin call - using script:', script?.name ?? '(none — business default)',
      'speed:', speed, 'country:', lead.country, 'source:', scriptSource
    );

    const opener = buildOpenerLine({
      script, company: lead.company, contact: lead.contact_person,
      industry: lead.industry, country: lead.country,
    });

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
            scriptId: script?.id ?? null, opener, speed,
            industry: lead.industry, country: lead.country,
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

    /* One row per dial, so the transcript callback has something to update and
       the log records which script was actually read. */
    const logged = await logCall({
      business_id: business.id,
      phone,
      from_number: from ?? null,
      customer_name: lead.contact_person ?? lead.company ?? null,
      vibe: 'PRO_CLOSER',
      language,
      script_id: script?.id ?? null,
      status,
      twilio_sid: twilioSid,
    });
    if (logged.error) console.warn('[Outbound] call not logged:', logged.error);

    return ok(
      {
        success: true,
        lead: updated,
        twilioSid,
        from,
        to: phone,
        language,
        script: script ? { id: script.id, name: script.name, speed } : null,
        scriptSource,
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

/**
 * Cindy's outbound TwiML. With the bridge configured this hands the call to
 * the media stream, which reads the script; without it, the opener is spoken
 * directly so the call is still intelligible.
 */
function outboundTwiml(o: {
  company: string | null; contact: string | null; language: string;
  scriptId: string | null; opener: string; speed: number | null;
  industry: string | null; country: string | null;
}): string {
  if (hasMediaBridge) {
    const params = [
      ['outbound', 'sales'],
      ['company', o.company ?? ''],
      ['contact', o.contact ?? ''],
      ['language', o.language],
      ['vibe', 'PRO_CLOSER'],
      ['scriptId', o.scriptId ?? ''],
      ['industry', o.industry ?? ''],
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
    `<Say voice="Polly.Joanna-Neural">${escapeXml('I will have a colleague follow up. Thank you for your time.')}</Say>` +
    `</Response>`
  );
}

function escapeXml(s: string) {
  return String(s).replace(/[<>&"']/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c] ?? c
  );
}
