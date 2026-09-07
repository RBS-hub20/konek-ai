import { getCallLog, updateCallLog, safe } from '@/lib/server/tenant';
import { verifyTrialCall } from '@/lib/server/trialToken';
import { explainTwilioFailure, fetchRecordingUrl, fetchTwilioCall } from '@/lib/server/twilioStatus';
import { fail, ok, describeError } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/* Twilio's call states, in the words the welcome screen shows. */
const PHASE: Record<string, { label: string; done: boolean; rang: boolean }> = {
  queued: { label: 'Dialling…', done: false, rang: false },
  initiated: { label: 'Dialling…', done: false, rang: false },
  ringing: { label: 'Your phone is ringing', done: false, rang: true },
  'in-progress': { label: 'On the call with Cindy', done: false, rang: true },
  completed: { label: 'Call finished', done: true, rang: true },
  busy: { label: 'Your line was busy', done: true, rang: true },
  'no-answer': { label: 'No answer', done: true, rang: true },
  failed: { label: 'The call could not be connected', done: true, rang: false },
  canceled: { label: 'Call cancelled', done: true, rang: false },
};

/**
 * GET /api/try-free-call/:id?t=<token> — how the demo call is going.
 *
 * Polled with no session, so it is gated on the token handed out with the
 * callId rather than on a column: a deployment whose schema predates
 * is_trial drops that flag on insert, and the poll then 404s forever while
 * the page sits on "Connecting…". That is the bug this route had.
 *
 * The status comes from Twilio itself, not from our own row. Our row only
 * changes when Twilio posts back; until then it says "Calling" whether the
 * phone is ringing or the call failed outright, which is exactly the
 * difference the caller needs to see.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const id = params.id?.trim();
  if (!id) return fail('A call id is required.');

  const token = new URL(req.url).searchParams.get('t');

  try {
    const call = await getCallLog(id);
    if (!call) return fail('That call is not available.', 404);

    /* The token proves this browser asked for the call. is_trial is still
       honoured for links issued before tokens existed. */
    if (!verifyTrialCall(id, token) && !call.is_trial) {
      return fail('That call is not available.', 404);
    }

    /* The recording callback can be lost, so once Twilio says the call is
       over we ask it directly rather than leaving a play button that never
       appears. */
    let recordingUrl = call.recording_url;
    const live = call.twilio_sid ? await fetchTwilioCall(call.twilio_sid) : null;
    const twilio = live && 'status' in live ? live : null;
    const twilioError = live && 'error' in live ? live.error : null;

    const status = twilio?.status ?? String(call.status ?? 'queued').toLowerCase();
    const phase = PHASE[status] ?? { label: 'Connecting…', done: false, rang: false };
    const failure = twilio ? explainTwilioFailure(twilio.errorCode, twilio.to) : null;

    if (!recordingUrl && call.twilio_sid && (twilio?.status === 'completed' || phase.done)) {
      recordingUrl = await fetchRecordingUrl(call.twilio_sid);
      if (recordingUrl) await safe(() => updateCallLog(call.id, { recording_url: recordingUrl }), null);
    }

    return ok({
      id: call.id,
      /* Twilio's own word for it, so "failed" never reads as "connecting". */
      status,
      label: phase.label,
      rang: phase.rang,
      finished: phase.done,
      failed: status === 'failed' || status === 'canceled',
      durationSeconds: twilio?.durationSeconds || call.duration_seconds || 0,
      /* Our own streaming route, not Twilio's URL: Twilio's needs Basic auth
         and would expose the account SID to the page. */
      recordingUrl: recordingUrl
        ? `/api/try-free-call/${call.id}/audio${token ? `?t=${encodeURIComponent(token)}` : ''}`
        : null,
      hasRecording: Boolean(recordingUrl),
      transcript: call.transcript,
      language: call.language,
      /* "Ready" now means there is something to show, not merely that the
         call ended — the page was stopping its poll before the recording and
         transcript arrived, and then waited for ever. */
      ready: Boolean(recordingUrl) && Boolean(call.transcript),
      startedAt: call.created_at,
      /* Present only when something went wrong, and written for a person. */
      ...(failure ? { failureReason: failure } : {}),
      ...(twilio?.errorCode ? { twilioCode: twilio.errorCode } : {}),
      ...(twilioError ? { statusUnavailable: twilioError } : {}),
    });
  } catch (err) {
    return fail('Could not read that call', 500, describeError(err).detail);
  }
}
