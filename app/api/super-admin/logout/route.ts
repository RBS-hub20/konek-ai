import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/superAdminAuth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** POST — ends the session on this browser. */
export async function POST() {
  const res = NextResponse.json({ success: true });
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return res;
}

export const GET = POST;
