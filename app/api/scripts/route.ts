import { deleteScript, listScripts, pickScript, saveScript, setDefaultScript } from '@/lib/server/tenant';
import type { OutboundScript } from '@/lib/types2';
import { describeError, fail, handle, ok, readJson } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** GET /api/scripts  ·  ?industry=&country= to see which one a call would use. */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  return handle(async () => {
    const scripts = await listScripts();
    const industry = p.get('industry');
    const country = p.get('country');
    return {
      scripts,
      ...(industry || country ? { wouldUse: await pickScript(industry, country) } : {}),
    };
  });
}

/** POST /api/scripts — create or update. { setDefault: true } promotes it. */
export async function POST(req: Request) {
  const body = await readJson<Partial<OutboundScript> & { setDefault?: boolean }>(req);
  if (!body) return fail('Invalid JSON body');
  if (!body.name?.trim() && !body.id) return fail('name is required');

  try {
    const saved = await saveScript(body);
    const final = body.setDefault ? await setDefaultScript(saved.id) : saved;
    return ok({ script: final ?? saved }, { status: body.id ? 200 : 201 });
  } catch (err) {
    return fail('Could not save the script', 500, describeError(err).detail);
  }
}

/** DELETE /api/scripts?id= */
export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return fail('id is required');
  try {
    await deleteScript(id);
    return ok({ deleted: id });
  } catch (err) {
    return fail('Could not delete the script', 500, describeError(err).detail);
  }
}
