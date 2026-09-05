/* ═══════════════════════════════════════════════════════════════════
   The super admin session.

   Written against Web Crypto rather than node:crypto so the same code
   runs in middleware, which is where the check has to happen — a guard
   that only runs inside route handlers leaves the pages open.

   The cookie carries an expiry and an HMAC over it. Nothing else: it
   is a "this browser proved it knows the password" token, not an
   identity.
   ═══════════════════════════════════════════════════════════════════ */

export const SESSION_COOKIE = 'super_admin_session';
export const SESSION_DAYS = 7;

/** The password the wall checks against. */
export function configuredPassword(): string {
  const set = process.env.SUPER_ADMIN_PASSWORD?.trim();
  return set || DEFAULT_PASSWORD;
}

/* Documented in .env.example and in the repo, so it protects nobody on its
   own — it exists so the wall is never accidentally wide open, and the UI
   says loudly when it is still in use. */
export const DEFAULT_PASSWORD = 'KonekSuper2025!';

export const usingDefaultPassword = () => !process.env.SUPER_ADMIN_PASSWORD?.trim();

/** Signing key: the deployment's own secret when there is one. */
function signingSecret(): string {
  return process.env.KONEK_API_SECRET?.trim() || `konek-super-admin::${configuredPassword()}`;
}

const encoder = new TextEncoder();

async function hmac(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(signingSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return base64url(new Uint8Array(sig));
}

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** A token good for SESSION_DAYS. */
export async function createSession(): Promise<{ token: string; maxAge: number }> {
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  const expires = Math.floor(Date.now() / 1000) + maxAge;
  const payload = `v1.${expires}`;
  return { token: `${payload}.${await hmac(payload)}`, maxAge };
}

export async function verifySession(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') return false;

  const expires = Number(parts[1]);
  if (!Number.isFinite(expires) || expires <= Math.floor(Date.now() / 1000)) return false;

  const expected = await hmac(`${parts[0]}.${parts[1]}`);
  return timingSafeEqual(parts[2], expected);
}

/** Constant time, so the signature cannot be guessed a character at a time. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Paths the wall covers. The login page and its endpoints stay open. */
export const PROTECTED_PREFIXES = [
  '/super-admin',
  '/api/super-admin',
  '/api/platform',
  '/api/leads',
  '/api/outbound',
  '/api/scripts',
  '/api/db',
  '/api/admin/dedupe',
];

export const OPEN_PATHS = [
  '/super-admin/login',
  '/api/super-admin/auth',
  '/api/super-admin/logout',
];

export function isProtected(pathname: string): boolean {
  if (OPEN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return false;
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
