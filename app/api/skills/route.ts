import { listSkills, setSkillEnabled, isLive } from '@/lib/server/repo';
import { DEMO_BUSINESS_ID } from '@/lib/server/seed';
import { fail, handle, ok, readJson } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** GET /api/skills?businessId= — the catalogue plus this business's on/off state. */
export async function GET(req: Request) {
  const businessId = new URL(req.url).searchParams.get('businessId') ?? DEMO_BUSINESS_ID;
  return handle(async () => ({
    skills: await listSkills(businessId),
    businessId,
    live: isLive(),
  }));
}

/** POST /api/skills — { businessId, skillId, enabled } toggles one skill. */
export async function POST(req: Request) {
  const body = await readJson<{ businessId?: string; skillId?: string; enabled?: boolean }>(req);
  if (!body?.skillId) return fail('skillId is required');
  if (typeof body.enabled !== 'boolean') return fail('enabled must be true or false');

  const businessId = body.businessId ?? DEMO_BUSINESS_ID;
  try {
    const result = await setSkillEnabled(businessId, body.skillId, body.enabled);
    return ok({ ...result, businessId });
  } catch (err) {
    return fail('Could not update skill', 500, err instanceof Error ? err.message : String(err));
  }
}
