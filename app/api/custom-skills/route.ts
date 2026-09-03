import { createCustomSkill, deleteCustomSkill, listCustomSkills } from '@/lib/server/repo';
import { DEMO_BUSINESS_ID } from '@/lib/server/seed';
import type { CustomSkillRow } from '@/lib/types';
import { fail, handle, ok, readJson } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** GET /api/custom-skills?businessId= */
export async function GET(req: Request) {
  const businessId = new URL(req.url).searchParams.get('businessId') ?? DEMO_BUSINESS_ID;
  return handle(async () => ({ customSkills: await listCustomSkills(businessId), businessId }));
}

/** POST /api/custom-skills — compiles a plain-English description into a skill. */
export async function POST(req: Request) {
  const body = await readJson<Partial<CustomSkillRow>>(req);
  if (!body?.name?.trim()) return fail('name is required');
  if (!body.description?.trim()) return fail('description is required');

  const businessId = body.business_id ?? DEMO_BUSINESS_ID;
  const vibe = body.vibe ?? 'PRO CLOSER';
  const trigger = body.trigger_type ?? 'When customer says...';

  /* The generated prompt the voice agent actually runs. */
  const system_prompt =
    body.system_prompt ??
    `TRIGGER TYPE: ${trigger}\n` +
      (body.trigger_value ? `TRIGGER: ${body.trigger_value}\n` : '') +
      `RULE: ${body.description.trim()}\n\n` +
      `Respond in the ${vibe} vibe, stay strictly inside the Business Brain, and return to the call goal immediately afterwards.`;

  try {
    const created = await createCustomSkill({ ...body, business_id: businessId, vibe, trigger_type: trigger, system_prompt });
    return ok({ customSkill: created }, { status: 201 });
  } catch (err) {
    return fail('Could not create custom skill', 500, err instanceof Error ? err.message : String(err));
  }
}

/** DELETE /api/custom-skills?id= */
export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return fail('id is required');
  try {
    await deleteCustomSkill(id);
    return ok({ deleted: id });
  } catch (err) {
    return fail('Could not delete custom skill', 500, err instanceof Error ? err.message : String(err));
  }
}
