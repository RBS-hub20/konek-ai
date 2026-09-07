import { getCallLog } from '@/lib/server/tenant';
import { fail, ok, describeError } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/try-free-call/:id — how the demo call went.
 *
 * The welcome screen polls this with no session, so it will only ever return
 * a call whose is_trial flag is set. A tenant's real call logs carry customer
 * names and transcripts and stay behind the dashboard; guessing an id here
 * gets a 404, not somebody else's conversation.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const id = params.id?.trim();
  if (!id) return fail('A call id is required.');

  try {
    const call = await getCallLog(id);
    if (!call || !call.is_trial) return fail('That call is not available.', 404);

    const ready = call.status === 'Completed' || Boolean(call.transcript);

    return ok({
      id: call.id,
      status: call.status,
      /* Null until Twilio's completed callback lands. */
      durationSeconds: call.duration_seconds || 0,
      recordingUrl: call.recording_url,
      transcript: call.transcript,
      language: call.language,
      ready,
      startedAt: call.created_at,
    });
  } catch (err) {
    return fail('Could not read that call', 500, describeError(err).detail);
  }
}
