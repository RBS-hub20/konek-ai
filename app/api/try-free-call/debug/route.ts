import { db, hasSupabase } from '@/lib/supabase';
import { getBusinessForRead, safe } from '@/lib/server/tenant';
import { env, hasTwilio, hasMediaBridge } from '@/lib/env';
import { explainTwilioFailure, fetchRecordingUrl, fetchTwilioCall, maskPhone } from '@/lib/server/twilioStatus';
import { ok, describeError } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/try-free-call/debug — why the phone did not ring.
 *
 * Public on purpose, because the whole point is to answer that question
 * without a session, from a phone, while someone is standing there saying
 * nobody called. So it carries no secrets and no identifiers: booleans,
 * counts, Twilio's own status and error code, and phone numbers masked to
 * their last four digits.
 */
export async function GET() {
  const out: Record<string, unknown> = {};

  try {
    const { business } = await safe(() => getBusinessForRead(null), {
      business: null as never, ephemeral: true,
    });
    const from = business?.outbound_number?.trim() || env.twilioNumber;

    out.twilioConfigured = hasTwilio;
    out.from = maskPhone(from);
    out.fromSource = business?.outbound_number?.trim()
      ? "the tenant's outbound_number"
      : 'TWILIO_PHONE_NUMBER';
    out.appUrl = env.appUrl;
    out.bridgeUrl = env.mediaStreamUrl || null;
    out.bridgeConfigured = hasMediaBridge;
    out.supabase = hasSupabase;

    if (!hasTwilio) {
      out.verdict = 'Twilio is not configured — no call can be placed. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_PHONE_NUMBER.';
      return ok(out);
    }
    if (!from) {
      out.verdict = 'No "from" number. Set TWILIO_PHONE_NUMBER, or an outbound_number on the tenant.';
      return ok(out);
    }

    /* Whether the trial columns exist at all. A deployment that has not run
       the latest supabase.sql silently drops is_trial on insert, which used
       to strand the welcome screen on "Connecting…" for ever. */
    out.schema = await schemaReadiness();

    /* The most recent demo call, and what Twilio says became of it. */
    const last = await lastTrialCall();
    if (!last) {
      out.lastCall = null;
      out.verdict = 'No demo call has been recorded yet on this deployment.';
      return ok(out);
    }

    const live = last.twilio_sid ? await fetchTwilioCall(last.twilio_sid) : null;
    const twilio = live && 'status' in live ? live : null;
    const twilioRecording = !last.recording_url && last.twilio_sid
      ? await fetchRecordingUrl(last.twilio_sid)
      : null;

    out.lastCall = {
      at: last.created_at,
      to: maskPhone(last.phone),
      ourStatus: last.status,
      dialled: Boolean(last.twilio_sid),
      twilioStatus: twilio?.status ?? null,
      twilioCode: twilio?.errorCode ?? null,
      twilioMessage: twilio?.errorMessage ?? null,
      durationSeconds: twilio?.durationSeconds ?? last.duration_seconds ?? null,
      /* The two things the welcome screen waits for. */
      hasRecording: Boolean(last.recording_url) || Boolean(twilioRecording),
      recordingSource: last.recording_url ? 'saved by the callback' : twilioRecording ? 'found on Twilio' : null,
      hasTranscript: Boolean(last.transcript),
      ...(live && 'error' in live ? { statusUnavailable: live.error } : {}),
    };

    out.voice = await bridgeVoiceReport();
    out.verdict = verdictFor(last, twilio);
    return ok(out);
  } catch (err) {
    return ok({ ...out, error: describeError(err).detail ?? 'Could not run the check' });
  }
}

/* ── Pieces ──────────────────────────────────────────────────────── */

type Row = {
  created_at: string; phone: string | null; status: string; twilio_sid: string | null;
  recording_url: string | null; transcript: string | null; duration_seconds: number | null;
};

const SELECT = 'created_at, phone, status, twilio_sid, recording_url, transcript, duration_seconds';

async function lastTrialCall(): Promise<Row | null> {
  if (!hasSupabase) return null;
  /* Prefer a flagged trial row; fall back to the newest call when the column
     is missing, which is precisely the deployment that needs this answer. */
  const flagged = await safe(async () => {
    const { data, error } = await db().from('call_logs')
      .select(SELECT)
      .eq('is_trial', true)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return data as Row | null;
  }, undefined);
  if (flagged !== undefined) return flagged;

  return await safe(async () => {
    const { data, error } = await db().from('call_logs')
      .select(SELECT)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return data as Row | null;
  }, null);
}

async function schemaReadiness(): Promise<Record<string, boolean | string>> {
  if (!hasSupabase) return { note: 'Running without Supabase — nothing persists.' };
  const probe = async (table: string, column: string) =>
    await safe(async () => {
      const { error } = await db().from(table).select(column).limit(1);
      return !error;
    }, false);

  const leads = await probe('leads', 'is_trial');
  const calls = await probe('call_logs', 'is_trial');
  return {
    'leads.is_trial': leads,
    'call_logs.is_trial': calls,
    ...(leads && calls ? {} : { note: 'Run the latest supabase.sql — the trial columns are missing.' }),
  };
}

function verdictFor(last: Row, twilio: { status: string; errorCode: number | null; to: string | null } | null): string {
  if (!last.twilio_sid) {
    return 'The last demo call was recorded but never handed to Twilio. Check the server logs for the error returned at dial time.';
  }
  if (!twilio) {
    return 'The call reached Twilio, but its status could not be read back. Check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.';
  }
  const explained = explainTwilioFailure(twilio.errorCode, twilio.to);
  if (explained) return explained;

  switch (twilio.status) {
    case 'completed':
      return 'Twilio says the last demo call connected and completed. If nobody heard it ring, check the handset rather than the app.';
    case 'busy':
      return 'The line was busy.';
    case 'no-answer':
      return 'Twilio rang the number and nobody picked up.';
    case 'failed':
    case 'canceled':
      return `Twilio could not connect the call (status "${twilio.status}"${twilio.errorCode ? `, code ${twilio.errorCode}` : ''}).`;
    default:
      return `Twilio has the call as "${twilio.status}".`;
  }
}

/**
 * What the bridge says about the voice on recent calls.
 *
 * "It sounded like a robot" is a bridge question, not a Vercel one — the
 * synthesiser lives there. This pulls its redacted summary so both halves
 * of the answer arrive in one place.
 */
async function bridgeVoiceReport(): Promise<unknown> {
  const wss = env.mediaStreamUrl;
  if (!wss) return { note: 'No bridge configured.' };
  const http = wss.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:').replace(/\/media-stream$/, '');
  try {
    const res = await fetch(`${http}/calls?n=5`, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return { note: `The bridge answered ${res.status} — it may be running an older build.` };
    return await res.json();
  } catch (err) {
    return { note: `Could not reach the bridge: ${err instanceof Error ? err.message : String(err)}` };
  }
}
