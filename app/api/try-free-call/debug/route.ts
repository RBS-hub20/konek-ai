import { db, hasSupabase } from '@/lib/supabase';
import { getBusinessForRead, safe } from '@/lib/server/tenant';
import { env, hasTwilio, hasMediaBridge } from '@/lib/env';
import { explainTwilioFailure, fetchTwilioCall, maskPhone } from '@/lib/server/twilioStatus';
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

    out.lastCall = {
      at: last.created_at,
      to: maskPhone(last.phone),
      ourStatus: last.status,
      dialled: Boolean(last.twilio_sid),
      twilioStatus: twilio?.status ?? null,
      twilioCode: twilio?.errorCode ?? null,
      twilioMessage: twilio?.errorMessage ?? null,
      durationSeconds: twilio?.durationSeconds ?? null,
      ...(live && 'error' in live ? { statusUnavailable: live.error } : {}),
    };

    out.verdict = verdictFor(last, twilio);
    return ok(out);
  } catch (err) {
    return ok({ ...out, error: describeError(err).detail ?? 'Could not run the check' });
  }
}

/* ── Pieces ──────────────────────────────────────────────────────── */

type Row = { created_at: string; phone: string | null; status: string; twilio_sid: string | null };

async function lastTrialCall(): Promise<Row | null> {
  if (!hasSupabase) return null;
  /* Prefer a flagged trial row; fall back to the newest call when the column
     is missing, which is precisely the deployment that needs this answer. */
  const flagged = await safe(async () => {
    const { data, error } = await db().from('call_logs')
      .select('created_at, phone, status, twilio_sid')
      .eq('is_trial', true)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return data as Row | null;
  }, undefined);
  if (flagged !== undefined) return flagged;

  return await safe(async () => {
    const { data, error } = await db().from('call_logs')
      .select('created_at, phone, status, twilio_sid')
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
