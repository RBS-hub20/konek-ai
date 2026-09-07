import { findCallByTwilioSid, updateCallLog } from '@/lib/server/tenant';
import { ok, describeError } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/call/recording — Twilio's recording callback.
 *
 * Form-encoded, and it arrives after the status callback, because the
 * recording is only finished once the call is. Matched to our row by CallSid,
 * the same way the transcript callback works.
 *
 * The URL Twilio posts has no extension; ".mp3" is what a browser can play,
 * so that is what gets stored.
 */
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const sid = (form.get('CallSid') as string) ?? '';
    const recordingUrl = (form.get('RecordingUrl') as string) ?? '';
    const duration = Number(form.get('RecordingDuration') ?? 0) || 0;
    const status = (form.get('RecordingStatus') as string) ?? '';

    if (!sid || !recordingUrl) return ok({ matched: false, note: 'No CallSid or RecordingUrl.' });
    if (status && status !== 'completed') return ok({ matched: false, status });

    const call = await findCallByTwilioSid(sid);
    if (!call) {
      /* Twilio retries, and our row may not exist for a call placed elsewhere. */
      console.warn(`[Recording] no call row for ${sid}`);
      return ok({ matched: false, note: 'No call row for this SID.' });
    }

    const url = recordingUrl.endsWith('.mp3') ? recordingUrl : `${recordingUrl}.mp3`;
    await updateCallLog(call.id, {
      recording_url: url,
      ...(duration && !call.duration_seconds ? { duration_seconds: duration } : {}),
    });
    console.log(`[Recording] saved for ${sid} (${duration}s)`);

    return ok({ matched: true, callId: call.id });
  } catch (err) {
    /* Never 500 at Twilio — it retries, and a retry storm helps nobody. */
    console.error('[Recording] callback failed:', describeError(err).detail);
    return ok({ matched: false, error: 'Could not store the recording.' });
  }
}

/** Twilio probes the URL before it uses it. */
export async function GET() {
  return ok({ ok: true, accepts: ['application/x-www-form-urlencoded'] });
}
