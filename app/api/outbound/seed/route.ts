import { listScripts, saveScript } from '@/lib/server/tenant';
import { BUILTIN_SCRIPTS } from '@/lib/seeds/outboundScripts';
import { describeError, fail, handle, ok } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** GET — what would be loaded, and what is already there. */
export async function GET() {
  return handle(async () => {
    const existing = await listScripts();
    const names = new Set(existing.map((s) => s.name));
    return {
      installed: existing.length,
      builtin: BUILTIN_SCRIPTS.map((s) => ({
        name: s.name, industry: s.industry, country: s.country,
        present: names.has(s.name),
      })),
      missing: BUILTIN_SCRIPTS.filter((s) => !names.has(s.name)).length,
    };
  });
}

/**
 * POST /api/outbound/seed
 *
 * Loads the built-in scripts. Matched on name, so it is safe to press twice
 * and never touches anything written by hand — seeding through SQL was skipped
 * whenever the table already had a row, which left a table that existed but
 * had nothing usable in it.
 */
export async function POST() {
  try {
    const existing = await listScripts();
    const byName = new Map(existing.map((s) => [s.name, s]));

    const created: string[] = [];
    const updated: string[] = [];

    for (const seed of BUILTIN_SCRIPTS) {
      const current = byName.get(seed.name);
      /* A built-in is refreshed in place; a custom script of the same name is
         left alone, because the operator wrote it. */
      if (current && current.is_builtin === false) continue;

      await saveScript({ ...seed, ...(current ? { id: current.id } : {}) });
      (current ? updated : created).push(seed.name);
    }

    const after = await listScripts();
    return ok({
      created: created.length,
      updated: updated.length,
      names: [...created, ...updated],
      total: after.length,
    });
  } catch (err) {
    return fail('Could not load the built-in scripts', 500, describeError(err).detail);
  }
}
