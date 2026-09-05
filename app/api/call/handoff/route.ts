import { getBusinessForRead, findCallByTwilioSid, updateCallLog, safe } from '@/lib/server/tenant';
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
    const target = business.handoff_number?.trim();

    if (!business.handoff_enabled || !target) {
      return ok({
        transferred: false,
        reason: 'No handoff number configured for this business.',
        configure: 'Settings → Human handoff',
      });
    }

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
        await client.calls(body.twilioSid).update({
          twiml:
            `<?xml version="1.0" encoding="UTF-8"?><Response>` +
            `<Say>${escapeXml(line)}</Say>` +
            `<Dial callerId="${escapeXml(business.outbound_number ?? env.twilioNumber)}" timeout="25">` +
            `${escapeXml(target)}</Dial>` +
            `<Say>${escapeXml('Sorry, nobody is available right now. We will call you back shortly.')}</Say>` +
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
          transcript: [existing?.transcript, `[handoff${body.reason ? `: ${body.reason}` : ''}] ${transferred ? `transferred to ${target}` : `failed — ${detail}`}`]
            .filter(Boolean).join('\n'),
        }),
        null
      );
    }

    return ok({ transferred, to: transferred ? target : null, spoken: line, ...(detail ? { detail } : {}) });
  } catch (err) {
    return fail('Handoff failed', 500, describeError(err).detail);
  }
}

function escapeXml(s: string) {
  return String(s).replace(/[<>&"']/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c] ?? c
  );
}
