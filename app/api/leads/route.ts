import { createLead, deleteLead, listLeads, updateLead } from '@/lib/server/tenant';
import type { Lead } from '@/lib/types2';
import { normalizePhone, countryFromE164 } from '@/lib/server/phone';
import { describeError, fail, handle, ok, readJson } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** GET /api/leads — the outbound pipeline, newest first. */
export async function GET() {
  return handle(async () => {
    const leads = await listLeads();
    const by = (s: string) => leads.filter((l) => l.status === s).length;
    return {
      leads,
      stats: {
        total: leads.length,
        new: by('New'),
        interested: by('Interested'),
        transferred: by('Transferred'),
        closed: by('Closed'),
        called: leads.filter((l) => l.call_count > 0).length,
      },
    };
  });
}

/** POST /api/leads — add one, or { leads: [...] } for a batch. */
export async function POST(req: Request) {
  const body = await readJson<Partial<Lead> & { leads?: Partial<Lead>[] }>(req);
  if (!body) return fail('Invalid JSON body');

  const rows = body.leads ?? [body];
  const clean: Partial<Lead>[] = [];
  for (const r of rows) {
    const phone = (r.phone ?? '').trim();
    if (!phone) return fail('phone is required');
    /* The lead's country turns a local number into a dialable one. */
    const n = normalizePhone(phone, r.country);
    if (!n.valid || !n.e164) return fail(n.reason ?? `"${phone}" is not a valid phone number.`);
    clean.push({ ...r, phone: n.e164, country: r.country ?? n.country ?? countryFromE164(n.e164) });
  }

  try {
    const created: Lead[] = [];
    for (const r of clean) created.push(await createLead(r));
    return ok({ leads: created, created: created.length }, { status: 201 });
  } catch (err) {
    return fail('Could not add lead', 500, describeError(err).detail);
  }
}

/** PATCH /api/leads — { id, ...fields } */
export async function PATCH(req: Request) {
  const body = await readJson<Partial<Lead> & { id?: string }>(req);
  if (!body?.id) return fail('id is required');
  const { id, ...patch } = body;
  try {
    const lead = await updateLead(id, patch);
    if (!lead) return fail('Lead not found', 404);
    return ok({ lead });
  } catch (err) {
    return fail('Could not update lead', 500, describeError(err).detail);
  }
}

/** DELETE /api/leads?id= */
export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return fail('id is required');
  try {
    await deleteLead(id);
    return ok({ deleted: id });
  } catch (err) {
    return fail('Could not delete lead', 500, describeError(err).detail);
  }
}
