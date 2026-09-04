import { createCustomSkill, deleteSkill, getBusiness, listSkills, setSkillActive } from '@/lib/server/tenant';
import { fail, handle, ok, readJson, describeError } from '@/lib/server/http';
import { hasSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** GET /api/skills?businessId= — global catalogue + this tenant's custom skills, with on/off state. */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  return handle(async () => {
    const business = await getBusiness(p.get('businessId'));
    if (!business) return { skills: [], businessId: null, live: hasSupabase };
    return { skills: await listSkills(business.id), businessId: business.id, live: hasSupabase };
  });
}

/** POST /api/skills — { skillId, enabled } toggle, or { create: {...} } for a custom skill. */
export async function POST(req: Request) {
  const body = await readJson<{
    businessId?: string; skillId?: string; enabled?: boolean;
    create?: { name: string; description?: string; category?: string; vibe?: string; script?: string; system_prompt?: string };
  }>(req);
  if (!body) return fail('Invalid JSON body');

  try {
    const business = await getBusiness(body.businessId);
    if (!business) return fail('No business found', 404);

    if (body.create) {
      if (!body.create.name?.trim()) return fail('create.name is required');
      const skill = await createCustomSkill(business.id, body.create);
      return ok({ skill, businessId: business.id }, { status: 201 });
    }

    if (!body.skillId) return fail('skillId is required');
    if (typeof body.enabled !== 'boolean') return fail('enabled must be true or false');

    await setSkillActive(business.id, body.skillId, body.enabled);
    return ok({ skillId: body.skillId, enabled: body.enabled, businessId: business.id });
  } catch (err) {
    return fail('Could not update skill', 500, describeError(err).detail);
  }
}

/** DELETE /api/skills?id=&businessId= — removes a custom skill (global ones are protected). */
export async function DELETE(req: Request) {
  const p = new URL(req.url).searchParams;
  const id = p.get('id');
  if (!id) return fail('id is required');
  try {
    const business = await getBusiness(p.get('businessId'));
    if (!business) return fail('No business found', 404);
    const skills = await listSkills(business.id);
    const target = skills.find((s) => s.id === id);
    if (!target) return fail('Skill not found', 404);
    if (target.business_id === null) return fail('Ready-made skills cannot be deleted — switch them off instead.', 403);
    await deleteSkill(business.id, id);
    return ok({ deleted: id });
  } catch (err) {
    return fail('Could not delete skill', 500, describeError(err).detail);
  }
}
