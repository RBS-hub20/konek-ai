import {
  getBrain, getBusiness, listCallLogs, listCampaigns, listSkills, overviewStats,
} from '@/lib/server/tenant';
import { handle } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** GET /api/overview?businessId= — everything the Overview tab renders. */
export async function GET(req: Request) {
  const businessId = new URL(req.url).searchParams.get('businessId');
  return handle(async () => {
    const business = await getBusiness(businessId);
    if (!business) {
      return {
        business: null,
        stats: { callsToday: 0, connectedPct: 0, hotLeads: 0, bookings: 0 },
        recentCalls: [], campaigns: [], setup: null,
      };
    }

    const [stats, recentCalls, campaigns, skills, brain] = await Promise.all([
      overviewStats(business.id),
      listCallLogs(business.id, 10),
      listCampaigns(business.id),
      listSkills(business.id),
      getBrain(business.id),
    ]);

    return {
      business,
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
