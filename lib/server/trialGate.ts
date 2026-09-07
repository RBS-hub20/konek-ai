import { db, hasSupabase } from '@/lib/supabase';
import { safe } from '@/lib/server/tenant';

/* ═══════════════════════════════════════════════════════════════════
   One free call per phone per day.

   The check reads the leads table rather than a process-local map: on
   Vercel every request may land on a different instance, so an in-memory
   counter would let the same number ring itself all afternoon simply by
   retrying. The map below is only the fallback for running without a
   database, where there is one process anyway.
   ═══════════════════════════════════════════════════════════════════ */

const WINDOW_MS = 24 * 60 * 60 * 1000;

type Attempt = { at: number };
const g = globalThis as typeof globalThis & { __konekTrialGate?: Map<string, Attempt> };
const local = () => (g.__konekTrialGate ??= new Map<string, Attempt>());

export type GateResult =
  | { allowed: true }
  | { allowed: false; retryAfterHours: number; reason: string };

const hoursUntil = (at: number) =>
  Math.max(1, Math.ceil((at + WINDOW_MS - Date.now()) / 3_600_000));

/** Has this number already had its free call today. */
export async function checkTrialGate(phone: string): Promise<GateResult> {
  const since = new Date(Date.now() - WINDOW_MS).toISOString();

  if (hasSupabase) {
    const row = await safe(async () => {
      const { data, error } = await db()
        .from('leads')
        .select('created_at')
        .eq('phone', phone)
        .eq('is_trial', true)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      /* A missing is_trial column must not hand out unlimited calls, so an
         error here falls through to the local map rather than passing. */
      if (error) throw error;
      return data;
    }, undefined);

    if (row?.created_at) {
      return {
        allowed: false,
        retryAfterHours: hoursUntil(new Date(row.created_at).getTime()),
        reason: 'This number already had its free call today.',
      };
    }
    if (row !== undefined) return { allowed: true };
  }

  const seen = local().get(phone);
  if (seen && Date.now() - seen.at < WINDOW_MS) {
    return {
      allowed: false,
      retryAfterHours: hoursUntil(seen.at),
      reason: 'This number already had its free call today.',
    };
  }
  return { allowed: true };
}

/** Records the attempt. Called once the call is actually placed. */
export function markTrialCall(phone: string): void {
  const m = local();
  m.set(phone, { at: Date.now() });
  /* Keep the map from growing without bound in a long-lived process. */
  if (m.size > 5000) {
    const cutoff = Date.now() - WINDOW_MS;
    for (const [k, v] of Array.from(m.entries())) if (v.at < cutoff) m.delete(k);
  }
}
