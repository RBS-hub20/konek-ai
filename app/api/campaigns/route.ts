import {
  addContacts, createCampaign, deleteCampaign, getBusiness,
  listCampaigns, listContacts, updateCampaign,
} from '@/lib/server/tenant';
import { fail, handle, ok, readJson, describeError } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** GET /api/campaigns?businessId=  ·  GET /api/campaigns?id=<id> (with contacts) */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  return handle(async () => {
    const business = await getBusiness(p.get('businessId'));
    if (!business) return { campaigns: [], businessId: null };

    const id = p.get('id');
    if (id) {
      const campaigns = await listCampaigns(business.id);
      const campaign = campaigns.find((c) => c.id === id) ?? null;
      return { campaign, contacts: campaign ? await listContacts(id) : [] };
    }
    return { campaigns: await listCampaigns(business.id), businessId: business.id };
  });
}

/** POST /api/campaigns — { name, vibe, skills[], contacts[] } creates it and its audience. */
export async function POST(req: Request) {
  const body = await readJson<{
    businessId?: string; name?: string; vibe?: string; skills?: string[];
    contacts?: { name?: string; phone: string }[];
  }>(req);
  if (!body?.name?.trim()) return fail('name is required');

  try {
    const business = await getBusiness(body.businessId);
    if (!business) return fail('No business found', 404);

    const campaign = await createCampaign(business.id, {
      name: body.name.trim(), vibe: body.vibe, skills: body.skills ?? [],
      status: 'Scheduled',
    });

    let added = 0;
    if (body.contacts?.length) {
      const rows = await addContacts(business.id, campaign.id, body.contacts);
      added = rows.length;
    }

    const campaigns = await listCampaigns(business.id);
    return ok({ campaign: campaigns.find((c) => c.id === campaign.id) ?? campaign, contactsAdded: added }, { status: 201 });
  } catch (err) {
    return fail('Could not create campaign', 500, describeError(err).detail);
  }
}

/** PATCH /api/campaigns — { id, ...fields } */
export async function PATCH(req: Request) {
  const body = await readJson<{ id?: string; [k: string]: unknown }>(req);
  if (!body?.id) return fail('id is required');
  const { id, ...patch } = body;
  try {
    return ok({ campaign: await updateCampaign(id, patch) });
  } catch (err) {
    return fail('Could not update campaign', 500, describeError(err).detail);
  }
}

/** DELETE /api/campaigns?id= */
export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return fail('id is required');
  try {
    await deleteCampaign(id);
    return ok({ deleted: id });
  } catch (err) {
    return fail('Could not delete campaign', 500, describeError(err).detail);
  }
}
