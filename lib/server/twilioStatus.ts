import { env, hasTwilio } from '@/lib/env';

/* ═══════════════════════════════════════════════════════════════════
   What Twilio thinks happened to a call.

   calls.create() returning a SID only means Twilio accepted the request.
   Everything that actually stops a phone ringing — geo permissions, an
   unverified number on a trial account, a carrier rejection — shows up
   afterwards, on the call resource. Without reading it back, a call that
   never rang and a call still ringing look identical from here.
   ═══════════════════════════════════════════════════════════════════ */

export interface TwilioCallStatus {
  /** queued | ringing | in-progress | completed | busy | failed | no-answer | canceled */
  status: string;
  durationSeconds: number;
  /** Twilio's own code for why it failed, when it did. */
  errorCode: number | null;
  errorMessage: string | null;
  startedAt: string | null;
  endedAt: string | null;
  to: string | null;
  from: string | null;
}

/** Never throws — a diagnosis endpoint that 500s tells you nothing. */
export async function fetchTwilioCall(sid: string): Promise<TwilioCallStatus | { error: string }> {
  if (!hasTwilio) return { error: 'Twilio is not configured on this deployment.' };
  try {
    const { default: Twilio } = await import('twilio');
    const client = Twilio(env.twilioSid, env.twilioToken);
    const c = await client.calls(sid).fetch();
    /* errorCode/errorMessage are on the wire but absent from the SDK's
       CallInstance type; they are the only fields that say why a call
       failed, so they are read through a cast rather than skipped. */
    const raw = c as unknown as { errorCode?: number | null; errorMessage?: string | null };
    return {
      status: c.status,
      durationSeconds: Number(c.duration ?? 0) || 0,
      errorCode: raw.errorCode ?? null,
      errorMessage: raw.errorMessage ?? null,
      startedAt: c.startTime ? new Date(c.startTime).toISOString() : null,
      endedAt: c.endTime ? new Date(c.endTime).toISOString() : null,
      to: c.to ?? null,
      from: c.from ?? null,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/** What a failed call actually means, in words the operator can act on. */
export function explainTwilioFailure(code: number | null, to: string | null): string | null {
  const where = to ? ` to ${to}` : '';
  switch (code) {
    case 13224:
    case 21215:
    case 21216:
      return `Twilio is not permitted to call this country. Enable it in Console → Voice → Geographic Permissions, then try again.`;
    case 21219:
    case 21608:
      return `This is a Twilio trial account, which can only call verified numbers. Verify the number in Console → Verified Caller IDs, or upgrade the account.`;
    case 21211:
      return `Twilio rejected the number${where} as not valid E.164.`;
    case 21606:
      return 'The "from" number is not a voice-capable Twilio number on this account.';
    case 20003:
      return 'Twilio rejected the credentials. Check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.';
    case 13223:
    case 32017:
      return `The carrier rejected the call${where} — the number may be unreachable or barred.`;
    case 31920:
      return 'The media stream could not connect, so the call was dropped. Check the bridge is up.';
    default:
      return null;
  }
}

/** "+639214879257" → "+63••••••9257", for anything a stranger can read. */
export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const s = String(phone);
  if (s.length < 7) return '•'.repeat(s.length);
  return `${s.slice(0, 3)}${'•'.repeat(Math.max(0, s.length - 7))}${s.slice(-4)}`;
}

/**
 * The finished recording for a call, straight from Twilio.
 *
 * Needed because the recording callback can be lost — a redeploy mid-call,
 * a retry that never lands — and the caller is sitting on the page waiting
 * for a play button. Asking Twilio directly always answers.
 */
export async function fetchRecordingUrl(callSid: string): Promise<string | null> {
  if (!hasTwilio) return null;
  try {
    const { default: Twilio } = await import('twilio');
    const client = Twilio(env.twilioSid, env.twilioToken);
    const list = await client.recordings.list({ callSid, limit: 1 });
    const rec = list[0];
    if (!rec) return null;
    return `https://api.twilio.com/2010-04-01/Accounts/${rec.accountSid}/Recordings/${rec.sid}.mp3`;
  } catch {
    return null;
  }
}

/**
 * Twilio serves recording media behind HTTP Basic auth on the account
 * credentials, so a browser cannot play the URL directly — it 401s. This
 * fetches the bytes server-side for a route to stream on.
 */
export async function fetchRecordingAudio(
  url: string
): Promise<{ body: ArrayBuffer; contentType: string } | { error: string }> {
  if (!hasTwilio) return { error: 'Twilio is not configured.' };
  try {
    const auth = Buffer.from(`${env.twilioSid}:${env.twilioToken}`).toString('base64');
    const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
    if (!res.ok) return { error: `Twilio returned ${res.status} for the recording.` };
    return {
      body: await res.arrayBuffer(),
      contentType: res.headers.get('content-type') ?? 'audio/mpeg',
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
