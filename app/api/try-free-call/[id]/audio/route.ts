import { getCallLog, updateCallLog, safe } from '@/lib/server/tenant';
import { verifyTrialCall } from '@/lib/server/trialToken';
import { fetchRecordingAudio, fetchRecordingUrl } from '@/lib/server/twilioStatus';
import { fail } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/try-free-call/:id/audio?t=<token> — the demo call, playable.
 *
 * Twilio serves recording media behind Basic auth on the account
 * credentials, so the browser cannot fetch the Twilio URL itself. This
 * streams the bytes instead, which also means the account SID never appears
 * in a page the visitor can read.
 *
 * Gated on the same token as the status poll, so it streams one call to the
 * browser that asked for it and nothing else.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const id = params.id?.trim();
  const token = new URL(req.url).searchParams.get('t');
  if (!id) return fail('A call id is required.');

  const call = await safe(() => getCallLog(id), null);
  if (!call) return fail('That call is not available.', 404);
  if (!verifyTrialCall(id, token) && !call.is_trial) return fail('That call is not available.', 404);

  /* Prefer what the callback stored; ask Twilio when it never arrived. */
  let url = call.recording_url;
  if (!url && call.twilio_sid) {
    url = await fetchRecordingUrl(call.twilio_sid);
    if (url) await safe(() => updateCallLog(call.id, { recording_url: url }), null);
  }
  if (!url) return fail('No recording for this call yet.', 404);

  const audio = await fetchRecordingAudio(url);
  if ('error' in audio) return fail(audio.error, 502);

  return new Response(audio.body, {
    headers: {
      'Content-Type': audio.contentType,
      'Content-Length': String(audio.body.byteLength),
      /* A finished recording never changes, but it is one person's call. */
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
