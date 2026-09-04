import { bumpCampaign, findCallByTwilioSid, updateCallLog, updateContactStatus } from '@/lib/server/tenant';
import type { CallLog } from '@/lib/types2';
import { fail, ok } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/call/transcript — the write-back for a finished call.
 *
 * Two producers post here:
 *   · Twilio    — form-encoded status callbacks (CallSid, CallStatus, CallDuration, RecordingUrl)
 *   · Deepgram  — JSON { callId | twilioSid, transcript, duration, status }
 *
 * Both are normalised onto the same call_logs row.
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
      duration = num(b.duration) ?? num(b.duration_seconds);
      status = str(b.status);
      recordingUrl = str(b.recordingUrl) ?? str(b.recording_url);
    } else {
      const form = await req.formData();
      twilioSid = (form.get('CallSid') as string) ?? undefined;
      status = mapTwilioStatus(form.get('CallStatus') as string | null);
      duration = Number(form.get('CallDuration') ?? 0) || undefined;
      recordingUrl = (form.get('RecordingUrl') as string) ?? undefined;
      transcript = (form.get('TranscriptionText') as string) ?? undefined;
    }

    let existing: CallLog | null = null;
    if (twilioSid) existing = await findCallByTwilioSid(twilioSid);
    if (!callId && existing) callId = existing.id;

    /* Twilio fires "initiated" before our own insert has necessarily landed.
       Acknowledge rather than 404, or Twilio will keep retrying. */
    if (!callId) return ok({ matched: false, note: 'No call row for this SID yet.' });

    const patch: Partial<CallLog> = {};
    if (transcript) patch.transcript = transcript;
    if (typeof duration === 'number') patch.duration_seconds = duration;
    if (status) patch.status = status;
    if (recordingUrl) patch.recording_url = recordingUrl;

    if (!Object.keys(patch).length) return ok({ callId, updated: false });

    const updated = await updateCallLog(callId, patch);

    /* A call that turned into a hot lead counts toward its campaign. */
    if (updated && status === 'Hot Lead' && existing?.status !== 'Hot Lead' && updated.campaign_id) {
      await bumpCampaign(updated.campaign_id, 'hot_leads');
    }
    if (updated?.contact_id && status) {
      await updateContactStatus(updated.contact_id, status);
    }

    return ok({ callId, updated: Boolean(updated), fields: Object.keys(patch) });
  } catch (err) {
    return fail('Could not record call result', 500, err instanceof Error ? err.message : String(err));
  }
}

/** Twilio probes the URL before using it. */
export async function GET() {
  return ok({ ok: true, accepts: ['application/json', 'application/x-www-form-urlencoded'] });
}

const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v ? Number(v) : undefined);

function deepgramTranscript(b: Record<string, unknown>): string | undefined {
  try {
    const results = b.results as { channels?: { alternatives?: { transcript?: string }[] }[] } | undefined;
    const t = results?.channels?.[0]?.alternatives?.[0]?.transcript;
    return t?.trim() ? t : undefined;
  } catch {
    return undefined;
  }
}

function mapTwilioStatus(s: string | null): string | undefined {
  if (!s) return undefined;
  const map: Record<string, string> = {
    queued: 'Initiated', initiated: 'Initiated', ringing: 'Initiated',
    'in-progress': 'Connected', completed: 'Completed',
    busy: 'No Answer', 'no-answer': 'No Answer',
    failed: 'Failed', canceled: 'Failed',
  };
  return map[s] ?? s;
}
