import crypto from 'crypto';
import { env, hasTwilio } from '@/lib/env';

/* ═══════════════════════════════════════════════════════════════════
   Dashboard calls vs machine calls.

   /api/call dials real phones, so it is gated by KONEK_API_SECRET. But
   the admin UI runs in the browser and must never hold that secret.

   So: the operator types the secret once into an unlock dialog, it is
   POSTed to /api/admin/login over HTTPS, verified server-side, and
   exchanged for a short-lived signed httpOnly cookie. The secret itself
   is never stored in the browser and never reaches the JS bundle.

   /api/call then accepts EITHER the x-konek-key header (machines) or a
   valid operator cookie (dashboard).
   ═══════════════════════════════════════════════════════════════════ */

export const OPERATOR_COOKIE = 'konek_op';
const TTL_SECONDS = 60 * 60 * 8; // 8 hours

function sign(payload: string): string {
  return crypto.createHmac('sha256', env.apiSecret).update(payload).digest('base64url');
}

export function issueOperatorToken(): { token: string; maxAge: number } {
  const expires = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const payload = `op.${expires}`;
  return { token: `${payload}.${sign(payload)}`, maxAge: TTL_SECONDS };
}

export function verifyOperatorToken(token: string | undefined | null): boolean {
  if (!token || !env.apiSecret) return false;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'op') return false;
  const payload = `${parts[0]}.${parts[1]}`;
  const expected = sign(payload);
  if (!timingSafeEqual(parts[2], expected)) return false;
  return Number(parts[1]) > Math.floor(Date.now() / 1000);
}

/** True when the request may place a live call. */
export function isAuthorizedCaller(req: Request): boolean {
  const header =
    req.headers.get('x-konek-key') ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    '';
  if (header && env.apiSecret && timingSafeEqual(header, env.apiSecret)) return true;
  return verifyOperatorToken(readCookie(req, OPERATOR_COOKIE));
}

export type CallGuard = { ok: true } | { ok: false; status: number; message: string; needsUnlock?: boolean };

/**
 * No Twilio  → mock mode, open (nobody is dialled).
 * Twilio, no secret → refuse; live dialling must never be accidentally open.
 * Twilio + secret → require the header or an operator cookie.
 */
export function guardCall(req: Request): CallGuard {
  if (!hasTwilio) return { ok: true };
  if (!env.apiSecret) {
    return { ok: false, status: 503, message: 'Set KONEK_API_SECRET to enable live calls' };
  }
  if (isAuthorizedCaller(req)) return { ok: true };
  return {
    ok: false,
    status: 401,
    message: 'Unlock required — enter your KONEK_API_SECRET to place live calls.',
    needsUnlock: true,
  };
}

export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

export function timingSafeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/** Rejects obviously malformed numbers before they reach Twilio. */
export function isValidPhone(n: string): boolean {
  return /^\+?[0-9][0-9\s\-().]{6,19}$/.test(n.trim());
}

/** Twilio needs E.164. Accepts "+971 50 118 4402" → "+971501184402". */
export function toE164(n: string): string {
  const trimmed = n.trim();
  const digits = trimmed.replace(/[^0-9]/g, '');
  return trimmed.startsWith('+') ? `+${digits}` : `+${digits}`;
}
