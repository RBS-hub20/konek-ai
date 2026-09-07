import { POST as callLead } from '@/app/api/leads/call/route';

/* The sales desk calls it by this name. One implementation, three routes:
   /api/leads/call, /api/outbound/call and this one. Next needs these two as
   literals in every route file. */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** POST { leadId, scriptId? } — Cindy calls the business to sell KONEK. */
export const POST = callLead;
