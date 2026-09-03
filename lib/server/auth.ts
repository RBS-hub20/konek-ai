import { env, hasTwilio } from '@/lib/env';

/* Placing a call costs real money and dials a real person, so the endpoint
   that does it must not be open to the internet. Rule:
     - No Twilio credentials  → mock mode, no key needed.
     - Twilio configured      → KONEK_API_SECRET must be set AND presented,
                                otherwise the request is refused.
   This makes it impossible to expose live dialling by accident. */

export type Guard = { ok: true } | { ok: false; status: number; message: string };

export function guardCallApi(req: Request): Guard {
  if (!hasTwilio) return { ok: true };

  if (!env.apiSecret) {
    return {
      ok: false,
      status: 503,
      message: 'Set KONEK_API_SECRET to enable live calls',
    };
  }

  const presented =
    req.headers.get('x-konek-key') ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    '';

  if (!presented || !timingSafeEqual(presented, env.apiSecret)) {
    return { ok: false, status: 401, message: 'Missing or invalid x-konek-key.' };
  }
  return { ok: true };
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Rejects obviously malformed numbers before they reach Twilio. */
export function isValidPhone(n: string): boolean {
  return /^\+?[0-9\s\-().]{7,20}$/.test(n.trim());
}
