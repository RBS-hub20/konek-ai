import { POST as callLead } from '@/app/api/leads/call/route';

/* The console calls it by this name; the implementation lives with the leads
   routes. Next needs these two as literals in every route file. */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** POST { leadId } — Cindy calls the lead. */
export const POST = callLead;
