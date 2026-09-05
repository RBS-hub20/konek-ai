import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, isProtected, verifySession } from '@/lib/superAdminAuth';

/**
 * The super admin wall.
 *
 * It runs here rather than in the layout so it covers the API routes too —
 * guarding only the pages would still have left the sales numbers, leads and
 * scripts readable by anyone with the URL.
 *
 * Machine callers (the media bridge) present x-konek-key instead of a cookie.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!isProtected(pathname)) return NextResponse.next();

  const apiKey = req.headers.get('x-konek-key');
  if (apiKey && process.env.KONEK_API_SECRET && apiKey === process.env.KONEK_API_SECRET) {
    return NextResponse.next();
  }

  if (await verifySession(req.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.next();
  }

  /* An API answers with a status the caller can act on; a page sends the
     person somewhere they can do something about it. */
  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { error: 'Super admin access required', loginAt: '/super-admin/login' },
      { status: 401 }
    );
  }

  const login = req.nextUrl.clone();
  login.pathname = '/super-admin/login';
  login.searchParams.set('next', pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ['/super-admin/:path*', '/api/super-admin/:path*', '/api/platform/:path*',
    '/api/leads/:path*', '/api/outbound/:path*', '/api/scripts/:path*',
    '/api/db/:path*', '/api/admin/dedupe'],
};
