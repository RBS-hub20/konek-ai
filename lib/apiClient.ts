'use client';

import type {
  Lead, OutboundScript, SalesSettings, Service,
  Business, BusinessBrain, CallLog, Campaign, Contact,
  KnowledgeFile, OverviewStats, SkillRecord,
} from './types2';

/* Browser client for the /api routes. Same-origin, so no keys travel with it —
   live calls are authorised by the httpOnly operator cookie instead. */

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    cache: 'no-store',
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error((body as ApiErr).detail || (body as ApiErr).error || `${res.status} ${res.statusText}`);
    (err as ApiError).status = res.status;
    (err as ApiError).needsUnlock = Boolean((body as ApiErr).needsUnlock);
    /* Twilio's own guidance is more useful than the generic message. */
    const hint = (body as { hint?: string; twilioError?: string }).hint;
    const twilioError = (body as { twilioError?: string }).twilioError;
    if (twilioError || hint) {
      (err as ApiError).message = [twilioError, hint].filter(Boolean).join(' — ');
    }
    throw err;
  }
  return body as T;
}

interface ApiErr { error?: string; detail?: string; needsUnlock?: boolean }
export interface ApiError extends Error { status?: number; needsUnlock?: boolean }

export interface PlaceCallResult {
  success: boolean; callId: string; twilioSid: string | null; status: string;
  mock: boolean; from: string; to: string; vibe: string; business: string;
  skillsUsed: string[]; promptChars: number; warning?: string;
}

export interface DryRunResult {
  dryRun: true; business: string; from: string; to: string; vibe: string;
  skillsUsed: string[]; goal: string; promptChars: number; opener: string; systemPrompt: string;
}

export const api = {
  /* Session / unlock */
  session: () => req<{ unlocked: boolean; unlockRequired: boolean; liveCallsEnabled: boolean; twilioConfigured: boolean }>('/api/admin/session'),
  unlock: (key: string) => req<{ unlocked: boolean }>('/api/admin/login', { method: 'POST', body: JSON.stringify({ key }) }),
  lock: () => req<{ unlocked: boolean }>('/api/admin/login', { method: 'DELETE' }),

  status: () => req<Record<string, unknown>>('/api/status'),

  /* Business */
  currentBusiness: () => req<{ business: Business | null }>('/api/business?current=1'),
  allBusinesses: () => req<{
    businesses: Business[];
    stats: { mrr: number; active: number; total: number; callsUsed: number; totalCalls: number; hotLeads: number };
    recentCalls: CallLog[];
  }>('/api/business'),
  updateBusiness: (id: string, patch: Partial<Business>) =>
    req<{ business: Business }>('/api/business', { method: 'PATCH', body: JSON.stringify({ id, ...patch }) }),
  dedupePreview: () =>
    req<{ duplicateGroups: number; wouldRemove: number; distinctMrr: number }>('/api/super-admin/merge-duplicates'),
  dedupeRun: () =>
    req<{ removed: number; remaining: number; mrr: number; problems?: string[] }>('/api/super-admin/merge-duplicates', {
      method: 'POST',
      body: JSON.stringify({ confirm: true }),
    }),
  bridgeHealth: () => req<Record<string, unknown>>('/api/bridge/health'),
  dbHealth: () => req<Record<string, unknown>>('/api/db/health'),

  /* Outbound sales */
  leads: () => req<{ leads: Lead[]; stats: Record<string, number> }>('/api/leads'),
  addLead: (input: Partial<Lead>) =>
    req<{ leads: Lead[]; created: number }>('/api/leads', { method: 'POST', body: JSON.stringify(input) }),
  updateLead: (id: string, patch: Partial<Lead>) =>
    req<{ lead: Lead }>('/api/leads', { method: 'PATCH', body: JSON.stringify({ id, ...patch }) }),
  deleteLead: (id: string) => req<{ deleted: string }>(`/api/leads?id=${id}`, { method: 'DELETE' }),
  /* scriptId is the script open in Script Studio — the call reads that one. */
  callLead: (leadId: string, scriptId?: string | null) =>
    req<{
      success: boolean; twilioSid: string | null; to: string; language: string;
      script: { id: string; name: string; speed: number | null } | null;
      scriptSource: 'selected' | 'auto';
      warning?: string;
    }>('/api/leads/call', { method: 'POST', body: JSON.stringify({ leadId, scriptId: scriptId ?? null }) }),
  salesSettings: () => req<{ sales: SalesSettings }>('/api/platform/sales'),
  saveSalesSettings: (patch: Partial<SalesSettings>) =>
    req<{ sales: SalesSettings }>('/api/platform/sales', { method: 'POST', body: JSON.stringify(patch) }),

  /* Outbound scripts */
  scripts: (industry?: string, country?: string) =>
    req<{ scripts: OutboundScript[]; wouldUse?: OutboundScript | null }>(
      `/api/scripts${industry || country ? `?industry=${industry ?? ''}&country=${country ?? ''}` : ''}`
    ),
  seedScripts: () => req<{ created: number; updated: number; total: number; names: string[] }>('/api/outbound/seed', { method: 'POST' }),
  saveScript: (script: Partial<OutboundScript> & { setDefault?: boolean }) =>
    req<{ script: OutboundScript }>('/api/scripts', { method: 'POST', body: JSON.stringify(script) }),
  deleteScript: (id: string) => req<{ deleted: string }>(`/api/scripts?id=${id}`, { method: 'DELETE' }),

  /* Services */
  services: (businessId?: string) =>
    req<{ services: Service[] }>(`/api/services${businessId ? `?businessId=${businessId}` : ''}`),
  saveServices: (services: Partial<Service>[], businessId?: string) =>
    req<{ services: Service[] }>('/api/services', { method: 'POST', body: JSON.stringify({ services, businessId }) }),
  dbReload: () => req<{ reloaded: boolean; note: string }>('/api/db/reload', { method: 'POST' }),

  createBusiness: (input: Partial<Business>) =>
    req<{ business: Business }>('/api/business', { method: 'POST', body: JSON.stringify(input) }),

  /* Overview */
  overview: (businessId?: string) => req<{
    business: Business | null; stats: OverviewStats; recentCalls: CallLog[]; campaigns: Campaign[];
    setup: { vibe: string; activeSkills: number; customSkills: number; callsUsed: number; callsLimit: number; goal: string } | null;
  }>(`/api/overview${businessId ? `?businessId=${businessId}` : ''}`),

  /* Skills */
  skills: (businessId?: string) =>
    req<{ skills: SkillRecord[]; businessId: string | null; live: boolean }>(`/api/skills${businessId ? `?businessId=${businessId}` : ''}`),
  toggleSkill: (skillId: string, enabled: boolean, businessId?: string) =>
    req<{ skillId: string; enabled: boolean }>('/api/skills', { method: 'POST', body: JSON.stringify({ skillId, enabled, businessId }) }),
  createSkill: (create: { name: string; description?: string; category?: string; vibe?: string; script?: string }, businessId?: string) =>
    req<{ skill: SkillRecord }>('/api/skills', { method: 'POST', body: JSON.stringify({ create, businessId }) }),
  deleteSkill: (id: string, businessId?: string) =>
    req<{ deleted: string }>(`/api/skills?id=${encodeURIComponent(id)}${businessId ? `&businessId=${businessId}` : ''}`, { method: 'DELETE' }),

  /* Business Brain */
  brain: (businessId?: string) =>
    req<{ brain: BusinessBrain | null; businessId: string | null; business?: Business }>(`/api/business-brain/save${businessId ? `?businessId=${businessId}` : ''}`),
  saveBrain: (patch: Partial<BusinessBrain> & { businessId?: string }) =>
    req<{ brain: BusinessBrain }>('/api/business-brain/save', { method: 'POST', body: JSON.stringify(patch) }),
  uploadText: (text: string, businessId?: string) =>
    req<UploadResult>('/api/business-brain/upload', { method: 'POST', body: JSON.stringify({ text, businessId }) }),
  uploadUrl: (url: string, businessId?: string) =>
    req<UploadResult>('/api/business-brain/upload', { method: 'POST', body: JSON.stringify({ url, businessId }) }),
  uploadFile: async (file: File, businessId?: string) => {
    const form = new FormData();
    form.append('file', file);
    if (businessId) form.append('businessId', businessId);
    const res = await fetch('/api/business-brain/upload', { method: 'POST', body: form });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((body as ApiErr).detail || (body as ApiErr).error || `Upload failed (${res.status})`);
    return body as UploadResult;
  },
  deleteKnowledge: (name: string, businessId?: string) =>
    req<{ deleted: string; knowledge_files: KnowledgeFile[] }>(
      `/api/business-brain/upload?name=${encodeURIComponent(name)}${businessId ? `&businessId=${businessId}` : ''}`,
      { method: 'DELETE' }
    ),

  /* Campaigns */
  campaigns: (businessId?: string) =>
    req<{ campaigns: Campaign[]; businessId: string | null }>(`/api/campaigns${businessId ? `?businessId=${businessId}` : ''}`),
  campaign: (id: string) => req<{ campaign: Campaign | null; contacts: Contact[] }>(`/api/campaigns?id=${id}`),
  createCampaign: (input: { name: string; vibe: string; skills: string[]; contacts: { name?: string; phone: string }[]; businessId?: string }) =>
    req<{ campaign: Campaign; contactsAdded: number }>('/api/campaigns', { method: 'POST', body: JSON.stringify(input) }),
  deleteCampaign: (id: string) => req<{ deleted: string }>(`/api/campaigns?id=${id}`, { method: 'DELETE' }),
  startCampaign: (campaignId: string, businessId?: string) =>
    req<{ started: number; failed: number; remaining: number; status: string; note?: string }>(
      '/api/campaigns/start', { method: 'POST', body: JSON.stringify({ campaignId, businessId }) }
    ),

  /* Calls */
  calls: (businessId?: string, limit = 100) =>
    req<{ calls: CallLog[] }>(`/api/call?limit=${limit}${businessId ? `&businessId=${businessId}` : ''}`),
  placeCall: (input: {
    to: string; customerName?: string; vibe?: string; language?: string;
    business_id?: string; campaign_id?: string; skills?: string[]; dryRun?: boolean;
  }) => req<PlaceCallResult & Partial<DryRunResult>>('/api/call', { method: 'POST', body: JSON.stringify(input) }),

  /* Integrations */
  integrations: (businessId?: string) =>
    req<{ integrations: { name: string; category: string; detail: string; connected: boolean; managedByEnv: boolean; meta: Record<string, unknown> }[]; businessId: string | null }>(
      `/api/integrations${businessId ? `?businessId=${businessId}` : ''}`
    ),
  setIntegration: (provider: string, connected: boolean, businessId?: string, apiKey?: string) =>
    req<{ integration: unknown }>('/api/integrations', { method: 'POST', body: JSON.stringify({ provider, connected, businessId, apiKey }) }),

  /* Twilio pool */
  twilioNumbers: (verify?: string) =>
    req<{ live: boolean; numbers: { phoneNumber: string; friendlyName: string; sid: string; assignedTo: { id: string; name: string } | null }[]; verify?: { verified: boolean; reason?: string } }>(
      `/api/twilio/numbers${verify ? `?verify=${encodeURIComponent(verify)}` : ''}`
    ),
  buyNumber: (input: { areaCode?: string; country?: string; businessId?: string; search?: boolean }) =>
    req<{ bought: boolean; phoneNumber?: string; available?: { phoneNumber: string; locality: string }[] }>(
      '/api/twilio/numbers', { method: 'POST', body: JSON.stringify(input) }
    ),

  checkout: (plan: 'starter' | 'pro') =>
    req<{ url: string; mock: boolean }>('/api/stripe/checkout', { method: 'POST', body: JSON.stringify({ plan }) }),
};

export interface UploadResult {
  source: string; type: string; chunks: number; embedded: number;
  embeddings: string; extracted?: boolean; url?: string | null; warning?: string;
}

/** Runs a request and returns null instead of throwing, for optional data. */
export async function tryApi<T>(fn: () => Promise<T>): Promise<T | null> {
  try { return await fn(); } catch { return null; }
}
