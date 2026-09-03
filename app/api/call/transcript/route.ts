import { findCallByTwilioSid, updateCall } from '@/lib/server/repo';
import { fail, ok } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/call/transcript
 *
 * Two producers post here:
 *   · Deepgram   — JSON  { callId | twilioSid, transcript, duration?, status?, recordingUrl? }
 *   · Twilio     — form-encoded status callbacks (CallSid, CallStatus, CallDuration, RecordingUrl)
 *
 * Both are normalised onto the same call row.
 */
export async function POST(req: Request) {
  const contentType = req.headers.get('content-type') ?? '';

  try {
    let callId: string | undefined;
    let twilioSid: string | undefined;
    let transcript: string | undefined;
    let duration: number | undefined;
    let status: string | undefined;
    let recordingUrl: string | undefined;

    if (contentType.includes('application/json')) {
      const b = (await req.json()) as Record<string, unknown>;
      callId = str(b.callId);
      twilioSid = str(b.twilioSid) ?? str(b.CallSid);
      transcript = str(b.transcript) ?? deepgramTranscript(b);
      duration = num(b.duration);
      status = str(b.status);
      recordingUrl = str(b.recordingUrl) ?? str(b.recording_url);
    } else {
      /* Twilio posts application/x-www-form-urlencoded */
      const form = await req.formData();
      twilioSid = (form.get('CallSid') as string) ?? undefined;
      status = mapTwilioStatus(form.get('CallStatus') as string | null);
      duration = Number(form.get('CallDuration') ?? 0) || undefined;
      recordingUrl = (form.get('RecordingUrl') as string) ?? undefined;
      transcript = (form.get('TranscriptionText') as string) ?? undefined;
    }

    if (!callId && twilioSid) {
      const existing = await findCallByTwilioSid(twilioSid);
      callId = existing?.id;
    }
    if (!callId) return fail('Unknown call — provide callId or a known twilioSid', 404);

    const patch: Record<string, unknown> = {};
    if (transcript) patch.transcript = transcript;
    if (typeof duration === 'number') patch.duration = duration;
    if (status) patch.status = status;
    if (recordingUrl) patch.recording_url = recordingUrl;

    if (!Object.keys(patch).length) return ok({ callId, updated: false });

    const updated = await updateCall(callId, patch);
    return ok({ callId, updated: Boolean(updated), fields: Object.keys(patch) });
  } catch (err) {
    return fail('Could not record transcript', 500, err instanceof Error ? err.message : String(err));
  }
}

/** Twilio also GETs this URL to verify it exists. */
export async function GET() {
  return ok({ ok: true, accepts: ['application/json', 'application/x-www-form-urlencoded'] });
}

const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v ? Number(v) : undefined);

/** Pulls the transcript out of a raw Deepgram results payload. */
function deepgramTranscript(b: Record<string, unknown>): string | undefined {
  try {
    const results = b.results as
      | { channels?: { alternatives?: { transcript?: string }[] }[] }
      | undefined;
    const t = results?.channels?.[0]?.alternatives?.[0]?.transcript;
    return t && t.trim() ? t : undefined;
  } catch {
    return undefined;
  }
}

function mapTwilioStatus(s: string | null): string | undefined {
  if (!s) return undefined;
  const map: Record<string, string> = {
    queued: 'initiated',
    initiated: 'initiated',
    ringing: 'initiated',
    'in-progress': 'connected',
    completed: 'completed',
    busy: 'no_answer',
    'no-answer': 'no_answer',
    failed: 'failed',
    canceled: 'failed',
  };
  return map[s] ?? s;
}
