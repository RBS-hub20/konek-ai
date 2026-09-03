'use client';

import type { BusinessRow, CallRow, SkillRow } from './types';

/* Thin client for the /api routes. Every call is wrapped so a backend that is
   not reachable degrades to the built-in mock data instead of blanking the UI. */

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || body.error || `${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export interface ServiceStatus {
  services: Record<string, boolean>;
  mode: 'live' | 'mock';
  note: string;
}

export const api = {
  status: () => req<ServiceStatus>('/api/status'),

  /* Skills */
  skills: (businessId?: string) =>
    req<{ skills: SkillRow[]; businessId: string; live: boolean }>(
      `/api/skills${businessId ? `?businessId=${businessId}` : ''}`
    ),
  toggleSkill: (skillId: string, enabled: boolean, businessId?: string) =>
    req<{ skillId: string; enabled: boolean }>('/api/skills', {
      method: 'POST',
      body: JSON.stringify({ skillId, enabled, businessId }),
    }),

  /* Custom skills */
  customSkills: (businessId?: string) =>
    req<{ customSkills: ServerCustomSkill[] }>(
      `/api/custom-skills${businessId ? `?businessId=${businessId}` : ''}`
    ),
  createCustomSkill: (input: {
    name: string;
    description: string;
    trigger_type: string;
    vibe: string;
    business_id?: string;
  }) =>
    req<{ customSkill: ServerCustomSkill }>('/api/custom-skills', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  deleteCustomSkill: (id: string) =>
    req<{ deleted: string }>(`/api/custom-skills?id=${encodeURIComponent(id)}`, { method: 'DELETE' }),

  /* Business */
  currentBusiness: () => req<{ business: BusinessRow | null }>('/api/business?current=1'),
  allBusinesses: () =>
    req<{
      businesses: BusinessRow[];
      stats: { mrr: number; active: number; total: number; callsUsed: number };
    }>('/api/business'),
  updateBusiness: (id: string, patch: Partial<BusinessRow>) =>
    req<{ business: BusinessRow }>('/api/business', {
      method: 'PATCH',
      body: JSON.stringify({ id, ...patch }),
    }),

  /* Business Brain */
  brain: (businessId?: string) =>
    req<{ sources: { source: string; type: string; chunks: number }[]; totalChunks: number }>(
      `/api/brain${businessId ? `?businessId=${businessId}` : ''}`
    ),
  uploadText: (text: string, businessId?: string) =>
    req<BrainUploadResult>('/api/brain/upload', {
      method: 'POST',
      body: JSON.stringify({ text, businessId }),
    }),
  uploadUrl: (url: string, businessId?: string) =>
    req<BrainUploadResult>('/api/brain/upload', {
      method: 'POST',
      body: JSON.stringify({ url, businessId }),
    }),
  uploadFile: async (file: File, businessId?: string) => {
    const form = new FormData();
    form.append('file', file);
    if (businessId) form.append('businessId', businessId);
    const res = await fetch('/api/brain/upload', { method: 'POST', body: form });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail || body.error || `Upload failed (${res.status})`);
    }
    return (await res.json()) as BrainUploadResult;
  },
  deleteBrainSource: (source: string, businessId?: string) =>
    req<{ deleted: string }>(
      `/api/brain?source=${encodeURIComponent(source)}${businessId ? `&businessId=${businessId}` : ''}`,
      { method: 'DELETE' }
    ),

  /* Calls */
  calls: (businessId?: string, limit = 50) =>
    req<{ calls: CallRow[] }>(
      `/api/call?limit=${limit}${businessId ? `&businessId=${businessId}` : ''}`
    ),
  placeCall: (input: {
    customerPhone: string;
    customerName?: string;
    vibe?: string;
    skills?: string[];
    businessId?: string;
    dryRun?: boolean;
  }) => req<PlaceCallResult>('/api/call', { method: 'POST', body: JSON.stringify(input) }),

  /* Billing */
  checkout: (plan: 'starter' | 'pro', businessId?: string) =>
    req<{ url: string; mock: boolean }>('/api/stripe/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan, businessId }),
    }),
};

export interface ServerCustomSkill {
  id: string;
  name: string;
  description: string | null;
  trigger_type: string | null;
  vibe: string | null;
  system_prompt: string | null;
  created_at: string;
}

export interface BrainUploadResult {
  source: string;
  type: string;
  chunks: number;
  embedded: number;
  embeddings: string;
  extracted?: boolean;
  warning?: string;
}

export interface PlaceCallResult {
  success: boolean;
  callId: string;
  status: string;
  mock: boolean;
  vibe: string;
  skillsUsed: string[];
  promptChars: number;
  warning?: string;
}

/** Runs a request and returns null instead of throwing, for optional data. */
export async function tryApi<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}
