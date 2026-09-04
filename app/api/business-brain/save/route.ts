import { getBusiness, getBrain, saveBrain, updateBusiness } from '@/lib/server/tenant';
import type { BusinessBrain } from '@/lib/types2';
import { fail, handle, ok, readJson, describeError } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** GET /api/business-brain/save?businessId= — read the current brain. */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  return handle(async () => {
    const business = await getBusiness(p.get('businessId'));
    if (!business) return { brain: null, businessId: null };
    return { brain: await getBrain(business.id), businessId: business.id, business };
  });
}

/** POST /api/business-brain/save — UPSERT the profile by business_id. */
export async function POST(req: Request) {
  const body = await readJson<Partial<BusinessBrain> & { businessId?: string }>(req);
  if (!body) return fail('Invalid JSON body');

  try {
    const business = await getBusiness(body.businessId);
    if (!business) return fail('No business found', 404);

    if (body.goal && !['Explain', 'Book', 'Close'].includes(body.goal)) {
      return fail('goal must be Explain, Book or Close');
    }

    const brain = await saveBrain(business.id, {
      business_name: body.business_name,
      what_you_sell: body.what_you_sell,
      price_range: body.price_range,
      goal: body.goal,
      website_link: body.website_link,
      knowledge_files: body.knowledge_files,
    });

    /* Keep the tenant's display name in step with the brain. */
    if (body.business_name && body.business_name !== business.name) {
      await updateBusiness(business.id, { name: body.business_name });
    }

    return ok({ brain, businessId: business.id });
  } catch (err) {
    return fail('Could not save business brain', 500, describeError(err).detail);
  }
}
