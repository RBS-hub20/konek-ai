import { deleteBrainBySource, listBrain } from '@/lib/server/repo';
import { DEMO_BUSINESS_ID } from '@/lib/server/seed';
import { fail, handle, ok } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** GET /api/brain?businessId= — knowledge chips, grouped by source. */
export async function GET(req: Request) {
  const businessId = new URL(req.url).searchParams.get('businessId') ?? DEMO_BUSINESS_ID;
  return handle(async () => {
    const rows = await listBrain(businessId);
    const bySource = new Map<string, { source: string; type: string; chunks: number }>();
    for (const r of rows) {
      const key = r.source_name ?? 'manual';
      const hit = bySource.get(key);
      if (hit) hit.chunks += 1;
      else bySource.set(key, { source: key, type: r.source_type ?? 'manual', chunks: 1 });
    }
    return { businessId, sources: Array.from(bySource.values()), totalChunks: rows.length };
  });
}

/** DELETE /api/brain?businessId=&source= — removes one uploaded source. */
export async function DELETE(req: Request) {
  const p = new URL(req.url).searchParams;
  const source = p.get('source');
  if (!source) return fail('source is required');
  const businessId = p.get('businessId') ?? DEMO_BUSINESS_ID;
  try {
    await deleteBrainBySource(businessId, source);
    return ok({ deleted: source, businessId });
  } catch (err) {
    return fail('Could not delete source', 500, err instanceof Error ? err.message : String(err));
  }
}
