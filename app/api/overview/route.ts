import {
  getBrain, listCallLogs, listCampaigns, listSkills, overviewStats,
  getBusinessForRead, safe,
} from '@/lib/server/tenant';
import { handle } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** GET /api/overview?businessId= — everything the Overview tab renders. */
export async function GET(req: Request) {
  const businessId = new URL(req.url).searchParams.get('businessId');
  return handle(async () => {
    const { business, ephemeral } = await getBusinessForRead(businessId);
    if (!business) {
      return {
        business: null,
        stats: { callsToday: 0, connectedPct: 0, hotLeads: 0, bookings: 0 },
        recentCalls: [], campaigns: [], setup: null,
      };
    }

    const [stats, recentCalls, campaigns, skills, brain] = await Promise.all([
      safe(() => overviewStats(business.id), { callsToday: 0, connectedPct: 0, hotLeads: 0, bookings: 0 }),
      safe(() => listCallLogs(business.id, 10), []),
      safe(() => listCampaigns(business.id), []),
      safe(() => listSkills(business.id), []),
      safe(() => getBrain(business.id), null),
    ]);

    return {
      business,
      ephemeral,
      stats,
      recentCalls,
      campaigns: campaigns.filter((c) => c.status === 'Running'),
      setup: {
        vibe: business.active_vibe,
        activeSkills: skills.filter((s) => s.is_active).length,
        customSkills: skills.filter((s) => s.business_id !== null).length,
        callsUsed: business.calls_used,
        callsLimit: business.calls_limit,
        goal: brain?.goal ?? 'Book',
      },
    };
  });
}
