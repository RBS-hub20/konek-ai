import {
  findCallByTwilioSid, findLeadByTwilioSid, getBusinessForRead,
  getSalesSettings, safe, updateCallLog, updateLead,
} from '@/lib/server/tenant';
import { env, hasTwilio } from '@/lib/env';
import { timingSafeEqual } from '@/lib/server/operator';
import { describeError, fail, ok, readJson } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/* What Kai says as it steps aside. Short — the caller has already asked twice
   by the time they say it out loud. */
const HANDING_OVER: Record<string, string> = {
  EN: 'Of course — putting you through to someone now, one moment.',
  TL: 'Sige po, ikokonekta ko po kayo sa isa sa amin ngayon. Sandali lang po.',
  TAGLISH: 'Sige po, I will connect you to someone right now. One moment po.',
  AR: 'بالتأكيد، سأحوّلك إلى أحد موظفينا الآن. لحظة من فضلك.',
  HI: 'ज़रूर, मैं आपको अभी किसी से जोड़ता हूँ। एक पल।',
};

/**
 * POST /api/call/handoff — { twilioSid, businessId?, language?, reason? }
 *
 * Redirects a call that is already in progress away from the AI and onto a
 * human. Twilio is told to run new TwiML on the live call, which ends the
 * media stream and dials the handoff number.
 *
 * Called by the bridge, so it takes the machine key rather than a cookie.
 */
export async function POST(req: Request) {
  if (env.apiSecret) {
    const key = req.headers.get('x-konek-key') ?? '';
    if (!key || !timingSafeEqual(key, env.apiSecret)) return fail('Missing or invalid x-konek-key.', 401);
  }

  const body = await readJson<{
    twilioSid?: string; callId?: string; businessId?: string; language?: string; reason?: string;
  }>(req);
  if (!body?.twilioSid && !body?.callId) return fail('twilioSid or callId is required');

  try {
    const { business } = await getBusinessForRead(body.businessId);

    /* An outbound sales call belongs to KONEK, not to a tenant, so it goes to
       the platform sales numbers rather than the tenant's own. */
    const lead = body.twilioSid ? await safe(() => findLeadByTwilioSid(body.twilioSid!), null) : null;
    const sales = await safe(() => getSalesSettings(), { manager_number: null, backup_number: null, whisper: true });

    const primary = lead ? sales.manager_number : business.handoff_number?.trim() || null;
    const backup = lead ? sales.backup_number : business.handoff_backup?.trim() || null;
    const allowed = lead ? true : business.handoff_enabled && business.handoff_mode !== 'ai_only';

    if (!allowed || !primary) {
      return ok({
        transferred: false,
        reason: lead
          ? 'No sales manager number configured.'
          : !allowed
            ? 'Handoff is switched off for this business.'
            : 'No handoff number configured for this business.',
        configure: lead ? 'Super Admin → Schema Health → Sales numbers' : 'Settings → Human handoff',
      });
    }
    const target = primary;

    const language = (body.language ?? business.language ?? 'EN').toUpperCase();
    const line = HANDING_OVER[language] ?? HANDING_OVER.EN;

    let transferred = false;
    let detail: string | undefined;

    if (hasTwilio && body.twilioSid) {
      try {
        const { default: Twilio } = await import('twilio');
        const client = Twilio(env.twilioSid, env.twilioToken);
        /* Replacing the TwiML on a live call ends the <Stream> and dials out.
           callerId stays the business number so the human sees who it is for. */
        /* The whisper plays to the person answering, not to the customer, so
           the manager knows who they are picking up before they speak. */
        const whisperUrl = sales.whisper !== false
          ? `${env.appUrl}/api/call/whisper?` + new URLSearchParams({
              company: lead?.company ?? business.name ?? '',
              contact: lead?.contact_person ?? '',
              industry: lead?.industry ?? '',
              country: lead?.country ?? '',
            }).toString()
          : null;

        const numberTag = (n: string) =>
          whisperUrl
            ? `<Number url="${escapeXml(whisperUrl)}">${escapeXml(n)}</Number>`
            : `<Number>${escapeXml(n)}</Number>`;

        /* Both numbers ring together — whoever answers first takes it, which
           beats waiting out a 25 second timeout on the primary. */
        const numbers = [target, backup].filter(Boolean) as string[];

        await client.calls(body.twilioSid).update({
          twiml:
            `<?xml version="1.0" encoding="UTF-8"?><Response>` +
            `<Say>${escapeXml(line)}</Say>` +
            `<Dial callerId="${escapeXml(business.outbound_number ?? env.twilioNumber)}" timeout="30" answerOnBridge="true">` +
            numbers.map(numberTag).join('') +
            `</Dial>` +
            `<Say>${escapeXml('Sorry, nobody is free right now. Someone will call you straight back.')}</Say>` +
            `</Response>`,
        });
        transferred = true;
      } catch (err) {
        detail = describeError(err).detail;
      }
    } else {
      detail = hasTwilio ? 'No twilioSid on this call.' : 'Twilio is not configured.';
    }

    /* Record it either way — a handoff that failed is the more important one. */
    const existing = body.twilioSid ? await safe(() => findCallByTwilioSid(body.twilioSid!), null) : null;
    const id = body.callId ?? existing?.id;
    if (id) {
      await safe(
        () => updateCallLog(id, {
          status: transferred ? 'Handed off' : 'Handoff failed',
          transferred_to: transferred ? target : null,
          transfer_status: transferred ? 'connected' : 'failed',
          transcript: [existing?.transcript, `[handoff${body.reason ? `: ${body.reason}` : ''}] ${transferred ? `transferred to ${target}` : `failed — ${detail}`}`]
            .filter(Boolean).join('\n'),
        }),
        null
      );
    }

    /* A lead that reached a human is the outcome the pipeline is measured on. */
    if (lead) {
      await safe(
        () => updateLead(lead.id, { status: transferred ? 'Transferred' : 'Interested' }),
        null
      );
    }

    return ok({
      transferred,
      to: transferred ? target : null,
      backup: backup ?? null,
      whisper: sales.whisper !== false,
      lead: lead ? { id: lead.id, company: lead.company } : null,
      spoken: line,
      ...(detail ? { detail } : {}),
    });
  } catch (err) {
    return fail('Handoff failed', 500, describeError(err).detail);
  }
}

function escapeXml(s: string) {
  return String(s).replace(/[<>&"']/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c] ?? c
  );
}
