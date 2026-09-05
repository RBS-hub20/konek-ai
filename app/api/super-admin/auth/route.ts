import { NextResponse } from 'next/server';
import {
  SESSION_COOKIE, configuredPassword, createSession, timingSafeEqual,
  usingDefaultPassword, verifySession,
} from '@/lib/superAdminAuth';
import { fail, readJson } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** GET — whether this browser already holds a session. */
export async function GET(req: Request) {
  const cookie = req.headers.get('cookie') ?? '';
  const token = cookie.split(';').map((c) => c.trim()).find((c) => c.startsWith(`${SESSION_COOKIE}=`))?.split('=')[1];
  return NextResponse.json({
    authenticated: await verifySession(token ? decodeURIComponent(token) : null),
    usingDefaultPassword: usingDefaultPassword(),
  });
}

/** POST { password } — exchanges the password for a signed session cookie. */
export async function POST(req: Request) {
  const body = await readJson<{ password?: string }>(req);
  const password = body?.password ?? '';
  if (!password) return fail('Password is required', 400);

  /* Compared in constant time so the response cannot be timed character by
     character. */
  if (!timingSafeEqual(password, configuredPassword())) {
    /* Slow every failure down a little, so guessing costs something. */
    await new Promise((r) => setTimeout(r, 400));
    return fail('Wrong password', 401);
  }

  const { token, maxAge } = await createSession();
  const res = NextResponse.json({
    success: true,
    expiresIn: maxAge,
    usingDefaultPassword: usingDefaultPassword(),
  });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge,
  });
  return res;
}
