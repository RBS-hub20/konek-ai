import { getCallLog, updateCallLog, safe } from '@/lib/server/tenant';
import { verifyTrialCall } from '@/lib/server/trialToken';
import { SESSION_COOKIE, verifySession } from '@/lib/superAdminAuth';
import { env, hasTwilio } from '@/lib/env';
import { fetchRecordingUrl } from '@/lib/server/twilioStatus';
import { fail } from '@/lib/server/http';

/* ═══════════════════════════════════════════════════════════════════
   Streaming a call recording to a browser.

   Twilio serves recording media behind HTTP Basic auth on the account
   credentials, so a page cannot fetch its URL directly — it 401s, and
   putting the credentials in the page is not an option. Everything goes
   through here instead.

   Range matters more than it looks: an <audio> element asks for bytes
   ranges to seek, and Safari will not play a source at all unless the
   server honours them. Answering 200 with the whole file is why a
   player can look fine and still refuse to scrub.
   ═══════════════════════════════════════════════════════════════════ */

/** The console's own session, so the call log can play anything. */
async function isSuperAdmin(req: Request): Promise<boolean> {
  const cookie = req.headers.get('cookie') ?? '';
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  return match ? await verifySession(decodeURIComponent(match[1])) : false;
}

export async function streamCallRecording(req: Request, id: string): Promise<Response> {
  if (!id) return fail('A call id is required.');
  const token = new URL(req.url).searchParams.get('t');

  const call = await safe(() => getCallLog(id), null);
  if (!call) return fail('That call is not available.', 404);

  /* Three ways in: the token issued with this call, the is_trial flag on
     links from before tokens existed, or a super admin session. */
  if (!verifyTrialCall(id, token) && !call.is_trial && !(await isSuperAdmin(req))) {
    return fail('That call is not available.', 404);
  }

  /* Prefer what the callback stored; ask Twilio when it never arrived, which
     also covers calls placed before recording was switched on. */
  let url = call.recording_url;
  if (!url && call.twilio_sid) {
    url = await fetchRecordingUrl(call.twilio_sid);
    if (url) await safe(() => updateCallLog(call.id, { recording_url: url }), null);
  }
  if (!url) {
    return Response.json(
      {
        error: 'No recording for this call.',
        reason: call.twilio_sid
          ? 'Twilio has no recording for it. Calls placed before recording was switched on do not have one, and a recording appears about thirty seconds after the call ends.'
          : 'This call was never handed to Twilio, so there is nothing to play.',
      },
      { status: 404 }
    );
  }
  if (!hasTwilio) return fail('Twilio is not configured on this deployment.', 503);

  /* Whatever the player asked for, Twilio is asked for the same. */
  const range = req.headers.get('range');
  const auth = Buffer.from(`${env.twilioSid}:${env.twilioToken}`).toString('base64');

  try {
    const upstream = await fetch(url, {
      headers: {
        Authorization: `Basic ${auth}`,
        ...(range ? { Range: range } : {}),
      },
    });

    if (!upstream.ok && upstream.status !== 206) {
      return fail(`Twilio returned ${upstream.status} for that recording.`, 502);
    }

    const headers = new Headers({
      'Content-Type': upstream.headers.get('content-type') ?? 'audio/mpeg',
      /* Without this the browser will not offer a scrub bar at all. */
      'Accept-Ranges': 'bytes',
      /* A finished recording never changes, but it is one person's call. */
      'Cache-Control': 'private, max-age=3600',
    });
    for (const h of ['content-length', 'content-range']) {
      const v = upstream.headers.get(h);
      if (v) headers.set(h, v);
    }

    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (err) {
    return fail(
      'Could not fetch that recording',
      502,
      err instanceof Error ? err.message : String(err)
    );
  }
}
