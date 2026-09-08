import { listBusinesses, updateBusiness, safe } from '@/lib/server/tenant';
import { ok, describeError, fail } from '@/lib/server/http';
import { timingSafeEqual } from '@/lib/server/operator';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * The monthly reset — clears each tenant's used minutes.
 *
 * Vercel calls this on the 1st (see vercel.json). It is idempotent: a
 * tenant whose period already started this month is skipped, so a retry, a
 * manual run, or two crons firing does not hand anybody a free month.
 *
 * Vercel signs its cron requests with CRON_SECRET. Without one set the
 * route still runs, because a reset that silently stops is worse than one
 * anybody can trigger — but it says so.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    const header = req.headers.get('authorization') ?? '';
    const given = header.replace(/^Bearer\s+/i, '');
    if (!given || !timingSafeEqual(given, secret)) {
      return fail('Invalid cron secret.', 401);
    }
  }

  const now = new Date();
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

  try {
    const businesses = await listBusinesses();
    const reset: string[] = [];
    const skipped: string[] = [];

    for (const b of businesses) {
      /* Already reset for this month. */
      if (b.minutes_period_start && b.minutes_period_start >= periodStart) {
        skipped.push(b.name);
        continue;
      }
      await safe(() => updateBusiness(b.id, {
        minutes_used_this_month: 0,
        minutes_period_start: periodStart,
      }), null);
      console.log(`[Cron] reset ${b.name}: ${b.minutes_used_this_month ?? 0} min → 0`);
      reset.push(b.name);
    }

    return ok({
      periodStart,
      reset: reset.length,
      skipped: skipped.length,
      names: reset,
      ...(secret ? {} : { warning: 'CRON_SECRET is not set, so this endpoint is unauthenticated.' }),
    });
  } catch (err) {
    return fail('Could not reset minutes', 500, describeError(err).detail);
  }
}

/* Vercel Cron issues GET. */
export const GET = POST;
