import { getBusinessForRead, getLead, getSalesTenant, getScript, logCall, pickScript, safe, updateLead } from '@/lib/server/tenant';
import { type OutboundScript } from '@/lib/types2';
import { buildOpenerLine, languageModeFor, speedFor } from '@/lib/voice/cindyReceptionist';
import { env, hasTwilio, hasMediaBridge } from '@/lib/env';
import { guardCall } from '@/lib/server/operator';
import { normalizePhone } from '@/lib/server/phone';
import { callerIdFor, callerIdWarning } from '@/lib/server/callerId';
import { signTrialCall } from '@/lib/server/trialToken';
import { explainTwilioFailure } from '@/lib/server/twilioStatus';
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

  const body = await readJson<{
    leadId?: string; scriptId?: string | null; script_id?: string | null; via?: string;
  }>(req);
  if (!body?.leadId) return fail('leadId is required');
  const chosenScriptId = (body.scriptId ?? body.script_id ?? null)?.trim() || null;
  const via = body.via?.trim() || null;

  try {
    const lead = await getLead(body.leadId);
    if (!lead) return fail('Lead not found', 404);
    const n = normalizePhone(lead.phone, lead.country);
    if (!n.valid || !n.e164) return fail(n.reason ?? `Lead phone "${lead.phone}" is not valid.`);
    const phone = n.e164;
    const { business } = await getBusinessForRead(null);
    /* The desk dials as itself: a business that misses the call and rings
       back must reach the KONEK AI sales line, not a tenant's receptionist. */
    const salesTenant = await safe(() => getSalesTenant(), null);
    const caller = callerIdFor(lead.country, business.outbound_number, salesTenant?.outbound_number);
    if (hasTwilio && !caller) return fail('No outbound number configured.', 400);
    const from = caller?.from ?? null;
    const callerWarning = caller ? callerIdWarning(caller, lead.country) : null;

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

    /* The script decides the language, not the lead's country. Reading a Gulf
       English script while the call opens in Taglish is the mismatch you get
       when an explicitly chosen script overrides the country but the language
       still follows it. With no script, the country decides as before. */
    const language = script
      ? (mode === 'PH-direct' ? 'TAGLISH' : 'EN')
      : lead.country === 'PH' ? 'TAGLISH' : 'EN';
    if (scriptSource === 'selected') {
      console.log(
        `[OutboundSales] Calling lead ${lead.company ?? lead.phone} with explicit script ` +
        `${script?.name}${via ? ` (from ${via})` : ''}`
      );
    }
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
          /* So the desk can play back how Cindy actually sounded, the same
             way the demo call can. */
          record: true,
          recordingStatusCallback: `${env.appUrl}/api/call/recording`,
          recordingStatusCallbackEvent: ['completed'],
          recordingStatusCallbackMethod: 'POST',
          statusCallback: `${env.appUrl}/api/call/transcript`,
          statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
          statusCallbackMethod: 'POST',
        });
        twilioSid = call.sid;
        if (salesTenant?.outbound_number) {
          console.log(`[OutboundSales] Calling with KONEK AI number ${salesTenant.outbound_number} (${salesTenant.name})`);
        }
        console.log(
          `[Outbound] Twilio call created: ${call.sid} to ${phone} from ${from} ` +
          `(${caller?.source}, ${lead.country ?? 'unknown country'}, recording on)`
        );
        if (callerWarning) console.warn(`[Outbound] ${callerWarning}`);
      } catch (err) {
        const t = err as { message?: string; code?: number | string };
        const code = typeof t.code === 'string' ? Number(t.code) : t.code ?? null;
        console.error(`[Outbound] Twilio refused the call to ${phone}: ${t.message} (code ${t.code})`);
        await safe(() => updateLead(lead.id, {
          status: 'No answer',
          notes: `Twilio refused: ${t.message ?? 'unknown'} (code ${t.code ?? 'none'})`,
        }), null);
        return Response.json(
          {
            success: false,
            error: 'Twilio rejected the call',
            twilioError: t.message,
            twilioCode: t.code ?? null,
            hint: twilioHint(t.code, lead.country)
              ?? explainTwilioFailure(Number.isFinite(code) ? (code as number) : null, phone),
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
      script_id: script?.id ?? null,
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
    /* The dialer follows this id to the transcript and the recording. */
    if (logged.id) await safe(() => updateLead(lead.id, { last_call_id: logged.id }), null);

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
        /* What the dialer polls, and its proof of ownership for playback. */
        callId: logged.id,
        callToken: logged.id ? signTrialCall(logged.id) : null,
        callerId: caller ? { from: caller.from, source: caller.source, fallback: caller.fallback } : null,
        ...(callerWarning ? { callerWarning } : {}),
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
