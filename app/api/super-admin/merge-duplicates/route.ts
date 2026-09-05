import { GET as dedupeGet, POST as dedupePost } from '@/app/api/admin/dedupe/route';

/* The merge is implemented once, in /api/admin/dedupe. This is the name the
   console calls it by. Next needs these two as literals in every route file,
   so they are declared rather than re-exported. */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** GET — preview which duplicate tenants would be removed. */
export const GET = dedupeGet;

/** POST { confirm: true } — merge them, keeping the oldest. */
export const POST = dedupePost;
