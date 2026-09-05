import {
  createService, deleteService, getBusinessForRead, listServices,
  replaceServices, safe, updateService,
} from '@/lib/server/tenant';
import type { Service } from '@/lib/types2';
import { describeError, fail, handle, ok, readJson } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** GET /api/services?businessId= — the price list the agent quotes from. */
export async function GET(req: Request) {
  const businessId = new URL(req.url).searchParams.get('businessId');
  return handle(async () => {
    const { business } = await getBusinessForRead(businessId);
    return { services: await safe(() => listServices(business.id), []), businessId: business.id };
  });
}

/** POST /api/services — one service, or { services: [...] } to replace the lot. */
export async function POST(req: Request) {
  const body = await readJson<Partial<Service> & { businessId?: string; services?: Partial<Service>[] }>(req);
  if (!body) return fail('Invalid JSON body');

  try {
    const { business } = await getBusinessForRead(body.businessId);

    if (Array.isArray(body.services)) {
      const rows = body.services.filter((s) => s.name?.trim());
      return ok({ services: await replaceServices(business.id, rows) }, { status: 201 });
    }

    if (!body.name?.trim()) return fail('name is required');
    return ok({ service: await createService(business.id, body) }, { status: 201 });
  } catch (err) {
    return fail('Could not save services', 500, describeError(err).detail);
  }
}

/** PATCH /api/services — { id, ...fields } */
export async function PATCH(req: Request) {
  const body = await readJson<Partial<Service> & { id?: string }>(req);
  if (!body?.id) return fail('id is required');
  const { id, ...patch } = body;
  try {
    const updated = await updateService(id, patch);
    if (!updated) return fail('Service not found', 404);
    return ok({ service: updated });
  } catch (err) {
    return fail('Could not update service', 500, describeError(err).detail);
  }
}

/** DELETE /api/services?id= */
export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return fail('id is required');
  try {
    await deleteService(id);
    return ok({ deleted: id });
  } catch (err) {
    return fail('Could not delete service', 500, describeError(err).detail);
  }
}
