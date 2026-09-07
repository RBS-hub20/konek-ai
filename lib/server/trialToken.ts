import { createHmac, timingSafeEqual as nodeTimingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';

/* ═══════════════════════════════════════════════════════════════════
   Proof that this browser is the one that asked for this demo call.

   The welcome screen polls a call it has no session for. Reading the
   is_trial column to decide that was a mistake twice over: a deployment
   whose schema predates the column drops it on insert, so the flag comes
   back false and the poll 404s forever — and a flag on the row cannot
   tell "the person who asked for this call" from "someone who guessed a
   UUID" anyway.

   A token handed out with the callId answers both. It carries nothing
   but the id, so it grants exactly one call's status and nothing else.
   ═══════════════════════════════════════════════════════════════════ */

const secret = () =>
  env.apiSecret?.trim() || process.env.SUPER_ADMIN_PASSWORD?.trim() || 'konek-trial-fallback';

export function signTrialCall(callId: string): string {
  return createHmac('sha256', secret()).update(`trial:${callId}`).digest('base64url');
}

export function verifyTrialCall(callId: string, token: string | null | undefined): boolean {
  if (!callId || !token) return false;
  const expected = Buffer.from(signTrialCall(callId));
  const given = Buffer.from(token);
  if (expected.length !== given.length) return false;
  return nodeTimingSafeEqual(expected, given);
}
