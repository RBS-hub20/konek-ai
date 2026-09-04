import { env, hasTwilio } from '@/lib/env';
import { issueOperatorToken, OPERATOR_COOKIE, timingSafeEqual } from '@/lib/server/operator';
import { fail, readJson } from '@/lib/server/http';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/admin/login — { key }
 * Exchanges KONEK_API_SECRET for a short-lived httpOnly operator cookie so the
 * dashboard can place calls without the secret ever entering client code.
 */
export async function POST(req: Request) {
  if (!env.apiSecret) {
    return fail(
      hasTwilio
        ? 'Set KONEK_API_SECRET to enable live calls'
        : 'No unlock needed — Twilio is not configured, so calls run in mock mode.',
      hasTwilio ? 503 : 400
    );
  }

  const body = await readJson<{ key?: string }>(req);
  const key = body?.key?.trim();
  if (!key) return fail('key is required');
  if (!timingSafeEqual(key, env.apiSecret)) return fail('Incorrect key', 401);

  const { token, maxAge } = issueOperatorToken();
  const res = NextResponse.json({ unlocked: true, expiresIn: maxAge });
  res.cookies.set(OPERATOR_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge,
  });
  return res;
}

/** DELETE — lock again. */
export async function DELETE() {
  const res = NextResponse.json({ unlocked: false });
  res.cookies.set(OPERATOR_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return res;
}
