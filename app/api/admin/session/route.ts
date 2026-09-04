import { env, hasTwilio } from '@/lib/env';
import { OPERATOR_COOKIE, readCookie, verifyOperatorToken } from '@/lib/server/operator';
import { ok } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** GET /api/admin/session — does the dashboard need to unlock before calling? */
export async function GET(req: Request) {
  const unlocked = verifyOperatorToken(readCookie(req, OPERATOR_COOKIE));
  return ok({
    unlocked,
    /* Mock mode needs no unlock — nobody gets dialled. */
    unlockRequired: hasTwilio && Boolean(env.apiSecret) && !unlocked,
    liveCallsEnabled: hasTwilio && Boolean(env.apiSecret),
    twilioConfigured: hasTwilio,
  });
}
