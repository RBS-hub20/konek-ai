import { db, hasSupabase } from '@/lib/supabase';
import { env } from '@/lib/env';
import type {
  Business, BusinessBrain, CallLog, Campaign, Contact,
  Integration, KnowledgeFile, OverviewStats, SkillRecord, VibeKey,
} from '@/lib/types2';
import { vibeToKey } from '@/lib/types2';
import { SEED_SKILLS } from './seed';

/* ═══════════════════════════════════════════════════════════════════
   Data access for the v2 multi-tenant schema.
   Supabase when configured; an in-process store otherwise so the whole
   dashboard is still clickable locally. Memory resets on restart, and
   on serverless it is per-instance — never rely on it in production.
   ═══════════════════════════════════════════════════════════════════ */

const uuid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const nowIso = () => new Date().toISOString();

interface Mem {
  businesses: Business[];
  brains: BusinessBrain[];
  campaigns: Campaign[];
  contacts: Contact[];
  callLogs: CallLog[];
  skills: SkillRecord[];
  enabled: Record<string, Set<string>>;
  integrations: Integration[];
}

const g = globalThis as unknown as { __konek2?: Mem };

function mem(): Mem {
  if (!g.__konek2) {
    const bizId = '00000000-0000-4000-8000-000000000001';
    g.__konek2 = {
      businesses: [{
        id: bizId, name: 'Nova Aesthetics', slug: 'nova-aesthetics',
        owner_email: 'owner@example.com', owner_name: 'Bianca Salvador',
        outbound_number: env.twilioNumber || '+12232263852',
        plan: 'pro', calls_used: 0, calls_limit: 2000, status: 'active', mrr: 149,
        active_vibe: 'PRO_CLOSER',
        settings: { whatsapp_followup: true, sms_fallback: true },
        created_at: nowIso(),
      }],
      brains: [{
        id: uuid(), business_id: bizId, business_name: 'Nova Aesthetics',
        what_you_sell: 'Skin treatments, facials and aftercare packages',
        price_range: '₱2,500 – ₱12,800', goal: 'Book',
        knowledge_files: [], website_link: null, updated_at: nowIso(),
      }],
      campaigns: [], contacts: [], callLogs: [],
      skills: SEED_SKILLS.map((s) => ({
        id: s.id, name: s.name, description: s.description,
        category: (s.category ?? '').toUpperCase(), vibe: vibeToKey(s.vibe ?? ''),
        system_prompt: s.system_prompt, script: null,
        business_id: null, is_active: false,
      })),
      enabled: { [bizId]: new Set(['booking', 'faq']) },
      integrations: [],
    };
  }
  return g.__konek2;
}

/* ── Businesses ──────────────────────────────────────────────────── */

const normalizeBusiness = (b: Record<string, unknown>): Business => ({
  id: String(b.id),
  name: String(b.name ?? 'Untitled'),
  slug: (b.slug as string) ?? null,
  owner_email: (b.owner_email as string) ?? null,
  owner_name: (b.owner_name as string) ?? null,
  outbound_number: (b.outbound_number as string) ?? null,
  plan: (b.plan as string) ?? 'starter',
  calls_used: Number(b.calls_used ?? 0),
  calls_limit: Number(b.calls_limit ?? 500),
  status: (b.status as string) ?? 'active',
  mrr: Number(b.mrr ?? 0),
  active_vibe: (b.active_vibe as string) ?? 'PRO_CLOSER',
  settings: (b.settings as Business['settings']) ?? {},
  created_at: (b.created_at as string) ?? nowIso(),
});

export async function listBusinesses(): Promise<Business[]> {
  if (!hasSupabase) return mem().businesses;
  const { data, error } = await db().from('businesses').select('*').order('created_at');
  if (error) throw error;
  return (data ?? []).map(normalizeBusiness);
}

/** The tenant the dashboard is operating on. Falls back to the first row. */
export async function getBusiness(id?: string | null): Promise<Business | null> {
  if (!hasSupabase) {
    const m = mem();
    return (id ? m.businesses.find((b) => b.id === id) : m.businesses[0]) ?? m.businesses[0] ?? null;
  }
  const q = db().from('businesses').select('*');
  const { data, error } = id
    ? await q.eq('id', id).maybeSingle()
    : await q.order('created_at').limit(1).maybeSingle();
  if (error) throw error;
  return data ? normalizeBusiness(data) : null;
}

export async function updateBusiness(id: string, patch: Partial<Business>): Promise<Business> {
  const allowed = [
    'name', 'slug', 'owner_email', 'owner_name', 'outbound_number', 'plan',
    'calls_used', 'calls_limit', 'status', 'mrr', 'active_vibe', 'settings',
  ] as const;
  const clean: Record<string, unknown> = {};
  for (const k of allowed) if (k in patch && patch[k] !== undefined) clean[k] = patch[k];

  if (!hasSupabase) {
    const m = mem();
    const i = m.businesses.findIndex((b) => b.id === id);
    if (i === -1) throw new Error('Business not found');
    m.businesses[i] = { ...m.businesses[i], ...(clean as Partial<Business>) };
    return m.businesses[i];
  }
  const { data, error } = await db().from('businesses').update(clean).eq('id', id).select().single();
  if (error) throw error;
  return normalizeBusiness(data);
}

export async function createBusiness(input: Partial<Business>): Promise<Business> {
  const row = {
    name: input.name ?? 'New business',
    slug: input.slug ?? (input.name ?? 'business').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    owner_email: input.owner_email ?? null,
    owner_name: input.owner_name ?? null,
    outbound_number: input.outbound_number ?? null,
    plan: input.plan ?? 'starter',
    calls_used: 0,
    calls_limit: input.calls_limit ?? (input.plan === 'pro' ? 2000 : input.plan === 'enterprise' ? 20000 : 500),
    status: input.status ?? 'active',
    mrr: input.mrr ?? (input.plan === 'pro' ? 149 : input.plan === 'enterprise' ? 2400 : 49),
    active_vibe: input.active_vibe ?? 'PRO_CLOSER',
    settings: input.settings ?? { whatsapp_followup: true, sms_fallback: true },
  };
  if (!hasSupabase) {
    const created = normalizeBusiness({ ...row, id: uuid(), created_at: nowIso() });
    mem().businesses.push(created);
    mem().enabled[created.id] = new Set(['booking', 'faq']);
    return created;
  }
  const { data, error } = await db().from('businesses').insert(row).select().single();
  if (error) throw error;
  const created = normalizeBusiness(data);
  await db().from('business_brain').insert({ business_id: created.id, business_name: created.name, goal: 'Book' });
  await db().from('business_skills').insert(
    ['booking', 'faq'].map((skill_id) => ({ business_id: created.id, skill_id, is_active: true }))
  );
  return created;
}

export async function incrementCallsUsed(businessId: string, by = 1) {
  const b = await getBusiness(businessId);
  if (!b) return;
  await updateBusiness(businessId, { calls_used: (b.calls_used ?? 0) + by });
}

/* ── Business Brain (profile) ────────────────────────────────────── */

const normalizeBrain = (r: Record<string, unknown>): BusinessBrain => ({
  id: String(r.id),
  business_id: String(r.business_id),
  business_name: (r.business_name as string) ?? null,
  what_you_sell: (r.what_you_sell as string) ?? null,
  price_range: (r.price_range as string) ?? null,
  goal: ((r.goal as BusinessBrain['goal']) ?? 'Book'),
  knowledge_files: Array.isArray(r.knowledge_files) ? (r.knowledge_files as KnowledgeFile[]) : [],
  website_link: (r.website_link as string) ?? null,
  updated_at: (r.updated_at as string) ?? nowIso(),
});

export async function getBrain(businessId: string): Promise<BusinessBrain | null> {
  if (!hasSupabase) return mem().brains.find((b) => b.business_id === businessId) ?? null;
  const { data, error } = await db().from('business_brain').select('*').eq('business_id', businessId).maybeSingle();
  if (error) throw error;
  return data ? normalizeBrain(data) : null;
}

/** UPSERT by business_id — one brain row per tenant. */
export async function saveBrain(businessId: string, patch: Partial<BusinessBrain>): Promise<BusinessBrain> {
  if (!hasSupabase) {
    const m = mem();
    const i = m.brains.findIndex((b) => b.business_id === businessId);
    const base: BusinessBrain = i >= 0 ? m.brains[i] : {
      id: uuid(), business_id: businessId, business_name: null, what_you_sell: null,
      price_range: null, goal: 'Book', knowledge_files: [], website_link: null, updated_at: nowIso(),
    };
    const merged = { ...base, ...patch, business_id: businessId, updated_at: nowIso() };
    if (i >= 0) m.brains[i] = merged; else m.brains.push(merged);
    return merged;
  }
  const row: Record<string, unknown> = { business_id: businessId, updated_at: nowIso() };
  for (const k of ['business_name', 'what_you_sell', 'price_range', 'goal', 'knowledge_files', 'website_link'] as const) {
    if (k in patch && patch[k] !== undefined) row[k] = patch[k];
  }
  const { data, error } = await db()
    .from('business_brain')
    .upsert(row, { onConflict: 'business_id' })
    .select()
    .single();
  if (error) throw error;
  return normalizeBrain(data);
}

export async function addKnowledgeFile(businessId: string, file: KnowledgeFile): Promise<BusinessBrain> {
  const brain = await getBrain(businessId);
  const files = [...(brain?.knowledge_files ?? []).filter((f) => f.name !== file.name), file];
  return saveBrain(businessId, { knowledge_files: files });
}

export async function removeKnowledgeFile(businessId: string, name: string): Promise<BusinessBrain> {
  const brain = await getBrain(businessId);
  const files = (brain?.knowledge_files ?? []).filter((f) => f.name !== name);
  return saveBrain(businessId, { knowledge_files: files });
}

/* ── Skills ──────────────────────────────────────────────────────── */

export async function listSkills(businessId: string): Promise<SkillRecord[]> {
  if (!hasSupabase) {
    const on = mem().enabled[businessId] ?? new Set<string>();
    return mem().skills
      .filter((s) => s.business_id === null || s.business_id === businessId)
      .map((s) => ({ ...s, is_active: on.has(s.id) }));
  }
  const [{ data: rows, error: e1 }, { data: links, error: e2 }] = await Promise.all([
    db().from('skills').select('*').or(`business_id.is.null,business_id.eq.${businessId}`),
    db().from('business_skills').select('skill_id, is_active').eq('business_id', businessId),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  const on = new Set((links ?? []).filter((l) => l.is_active).map((l) => String(l.skill_id)));
  return (rows ?? []).map((r) => ({
    id: String(r.id), name: String(r.name), description: r.description ?? null,
    category: r.category ?? null, vibe: r.vibe ?? null,
    system_prompt: String(r.system_prompt ?? ''), script: r.script ?? null,
    business_id: r.business_id ?? null, is_active: on.has(String(r.id)),
  }));
}

export async function setSkillActive(businessId: string, skillId: string, active: boolean) {
  if (!hasSupabase) {
    const set = (mem().enabled[businessId] ??= new Set());
    if (active) set.add(skillId); else set.delete(skillId);
    return { skillId, active };
  }
  const { error } = await db().from('business_skills').upsert(
    { business_id: businessId, skill_id: skillId, is_active: active },
    { onConflict: 'business_id,skill_id' }
  );
  if (error) throw error;
  return { skillId, active };
}

export async function createCustomSkill(businessId: string, input: {
  name: string; description?: string; category?: string; vibe?: string; system_prompt?: string; script?: string;
}): Promise<SkillRecord> {
  const id = `custom-${uuid().slice(0, 8)}`;
  const record: SkillRecord = {
    id,
    name: input.name,
    description: input.description ?? null,
    category: (input.category ?? 'SALES').toUpperCase(),
    vibe: vibeToKey(input.vibe ?? 'PRO_CLOSER'),
    system_prompt: input.system_prompt ?? input.description ?? input.name,
    script: input.script ?? input.description ?? null,
    business_id: businessId,
    is_active: true,
  };
  if (!hasSupabase) {
    mem().skills.push(record);
    (mem().enabled[businessId] ??= new Set()).add(id);
    return record;
  }
  const { error } = await db().from('skills').insert({
    id: record.id, name: record.name, description: record.description, category: record.category,
    vibe: record.vibe, system_prompt: record.system_prompt, script: record.script,
    business_id: businessId, is_active: true,
  });
  if (error) throw error;
  await setSkillActive(businessId, id, true);
  return record;
}

export async function deleteSkill(businessId: string, skillId: string) {
  if (!hasSupabase) {
    const m = mem();
    m.skills = m.skills.filter((s) => !(s.id === skillId && s.business_id === businessId));
    return;
  }
  const { error } = await db().from('skills').delete().eq('id', skillId).eq('business_id', businessId);
  if (error) throw error;
}

/* ── Campaigns ───────────────────────────────────────────────────── */

const normalizeCampaign = (r: Record<string, unknown>): Campaign => ({
  id: String(r.id),
  business_id: String(r.business_id),
  name: String(r.name),
  vibe: vibeToKey(String(r.vibe ?? 'PRO_CLOSER')),
  status: (r.status as Campaign['status']) ?? 'Scheduled',
  audience_count: Number(r.audience_count ?? 0),
  called_count: Number(r.called_count ?? 0),
  hot_leads: Number(r.hot_leads ?? 0),
  skills: Array.isArray(r.skills) ? (r.skills as string[]) : [],
  created_at: (r.created_at as string) ?? nowIso(),
});

export async function listCampaigns(businessId: string): Promise<Campaign[]> {
  if (!hasSupabase) return mem().campaigns.filter((c) => c.business_id === businessId);
  const { data, error } = await db().from('campaigns').select('*')
    .eq('business_id', businessId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(normalizeCampaign);
}

export async function getCampaign(id: string): Promise<Campaign | null> {
  if (!hasSupabase) return mem().campaigns.find((c) => c.id === id) ?? null;
  const { data, error } = await db().from('campaigns').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? normalizeCampaign(data) : null;
}

export async function createCampaign(businessId: string, input: {
  name: string; vibe?: string; skills?: string[]; status?: Campaign['status'];
}): Promise<Campaign> {
  const row = {
    business_id: businessId,
    name: input.name,
    vibe: vibeToKey(input.vibe ?? 'PRO_CLOSER'),
    status: input.status ?? 'Scheduled',
    audience_count: 0, called_count: 0, hot_leads: 0,
    skills: input.skills ?? [],
  };
  if (!hasSupabase) {
    const created = normalizeCampaign({ ...row, id: uuid(), created_at: nowIso() });
    mem().campaigns.unshift(created);
    return created;
  }
  const { data, error } = await db().from('campaigns').insert(row).select().single();
  if (error) throw error;
  return normalizeCampaign(data);
}

export async function updateCampaign(id: string, patch: Partial<Campaign>): Promise<Campaign> {
  if (!hasSupabase) {
    const m = mem();
    const i = m.campaigns.findIndex((c) => c.id === id);
    if (i === -1) throw new Error('Campaign not found');
    m.campaigns[i] = { ...m.campaigns[i], ...patch };
    return m.campaigns[i];
  }
  const { data, error } = await db().from('campaigns').update(patch).eq('id', id).select().single();
  if (error) throw error;
  return normalizeCampaign(data);
}

export async function bumpCampaign(id: string, field: 'called_count' | 'hot_leads', by = 1) {
  const c = await getCampaign(id);
  if (!c) return;
  await updateCampaign(id, { [field]: (c[field] ?? 0) + by } as Partial<Campaign>);
}

export async function deleteCampaign(id: string) {
  if (!hasSupabase) {
    const m = mem();
    m.campaigns = m.campaigns.filter((c) => c.id !== id);
    m.contacts = m.contacts.filter((c) => c.campaign_id !== id);
    return;
  }
  const { error } = await db().from('campaigns').delete().eq('id', id);
  if (error) throw error;
}

/* ── Contacts ────────────────────────────────────────────────────── */

const normalizeContact = (r: Record<string, unknown>): Contact => ({
  id: String(r.id),
  campaign_id: (r.campaign_id as string) ?? null,
  business_id: String(r.business_id),
  name: (r.name as string) ?? null,
  phone: String(r.phone),
  status: (r.status as string) ?? 'Pending',
  custom_fields: (r.custom_fields as Record<string, unknown>) ?? {},
  created_at: (r.created_at as string) ?? nowIso(),
});

export async function listContacts(campaignId: string): Promise<Contact[]> {
  if (!hasSupabase) return mem().contacts.filter((c) => c.campaign_id === campaignId);
  const { data, error } = await db().from('contacts').select('*')
    .eq('campaign_id', campaignId).order('created_at');
  if (error) throw error;
  return (data ?? []).map(normalizeContact);
}

export async function addContacts(
  businessId: string, campaignId: string,
  rows: { name?: string; phone: string; custom_fields?: Record<string, unknown> }[]
): Promise<Contact[]> {
  const payload = rows
    .filter((r) => r.phone?.trim())
    .map((r) => ({
      business_id: businessId, campaign_id: campaignId,
      name: r.name?.trim() || null, phone: r.phone.trim(),
      status: 'Pending', custom_fields: r.custom_fields ?? {},
    }));
  if (!payload.length) return [];

  let created: Contact[];
  if (!hasSupabase) {
    created = payload.map((p) => normalizeContact({ ...p, id: uuid(), created_at: nowIso() }));
    mem().contacts.push(...created);
  } else {
    const { data, error } = await db().from('contacts').insert(payload).select();
    if (error) throw error;
    created = (data ?? []).map(normalizeContact);
  }
  const all = await listContacts(campaignId);
  await updateCampaign(campaignId, { audience_count: all.length });
  return created;
}

export async function updateContactStatus(id: string, status: string) {
  if (!hasSupabase) {
    const c = mem().contacts.find((x) => x.id === id);
    if (c) c.status = status;
    return;
  }
  await db().from('contacts').update({ status }).eq('id', id);
}

/* ── Call logs ───────────────────────────────────────────────────── */

const normalizeCall = (r: Record<string, unknown>): CallLog => ({
  id: String(r.id),
  business_id: (r.business_id as string) ?? null,
  campaign_id: (r.campaign_id as string) ?? null,
  contact_id: (r.contact_id as string) ?? null,
  customer_name: (r.customer_name as string) ?? null,
  phone: (r.phone as string) ?? null,
  skills_used: Array.isArray(r.skills_used) ? (r.skills_used as string[]) : [],
  vibe: (r.vibe as string) ?? null,
  duration_seconds: Number(r.duration_seconds ?? 0),
  status: (r.status as string) ?? 'Initiated',
  recording_url: (r.recording_url as string) ?? null,
  transcript: (r.transcript as string) ?? null,
  twilio_sid: (r.twilio_sid as string) ?? null,
  created_at: (r.created_at as string) ?? nowIso(),
});

export async function listCallLogs(businessId?: string | null, limit = 100): Promise<CallLog[]> {
  if (!hasSupabase) {
    const rows = mem().callLogs;
    return (businessId ? rows.filter((c) => c.business_id === businessId) : rows).slice(0, limit);
  }
  let q = db().from('call_logs').select('*').order('created_at', { ascending: false }).limit(limit);
  if (businessId) q = q.eq('business_id', businessId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(normalizeCall);
}

export async function createCallLog(input: Partial<CallLog>): Promise<CallLog> {
  const row = {
    business_id: input.business_id ?? null,
    campaign_id: input.campaign_id ?? null,
    contact_id: input.contact_id ?? null,
    customer_name: input.customer_name ?? null,
    phone: input.phone ?? null,
    skills_used: input.skills_used ?? [],
    vibe: input.vibe ?? null,
    duration_seconds: input.duration_seconds ?? 0,
    status: input.status ?? 'Initiated',
    recording_url: input.recording_url ?? null,
    transcript: input.transcript ?? null,
    twilio_sid: input.twilio_sid ?? null,
  };
  if (!hasSupabase) {
    const created = normalizeCall({ ...row, id: uuid(), created_at: nowIso() });
    mem().callLogs.unshift(created);
    return created;
  }
  const { data, error } = await db().from('call_logs').insert(row).select().single();
  if (error) throw error;
  return normalizeCall(data);
}

export async function updateCallLog(id: string, patch: Partial<CallLog>): Promise<CallLog | null> {
  if (!hasSupabase) {
    const m = mem();
    const i = m.callLogs.findIndex((c) => c.id === id);
    if (i === -1) return null;
    m.callLogs[i] = { ...m.callLogs[i], ...patch };
    return m.callLogs[i];
  }
  const { data, error } = await db().from('call_logs').update(patch).eq('id', id).select().maybeSingle();
  if (error) throw error;
  return data ? normalizeCall(data) : null;
}

export async function findCallByTwilioSid(sid: string): Promise<CallLog | null> {
  if (!hasSupabase) return mem().callLogs.find((c) => c.twilio_sid === sid) ?? null;
  const { data, error } = await db().from('call_logs').select('*').eq('twilio_sid', sid).maybeSingle();
  if (error) throw error;
  return data ? normalizeCall(data) : null;
}

/** Overview tiles — computed from today's call_logs. */
export async function overviewStats(businessId: string): Promise<OverviewStats> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  let today: CallLog[];
  if (!hasSupabase) {
    today = mem().callLogs.filter(
      (c) => c.business_id === businessId && new Date(c.created_at) >= start
    );
  } else {
    const { data, error } = await db().from('call_logs').select('*')
      .eq('business_id', businessId).gte('created_at', start.toISOString());
    if (error) throw error;
    today = (data ?? []).map(normalizeCall);
  }

  const connected = today.filter((c) =>
    !['No Answer', 'Failed', 'Initiated'].includes(String(c.status))).length;

  return {
    callsToday: today.length,
    connectedPct: today.length ? Math.round((connected / today.length) * 100) : 0,
    hotLeads: today.filter((c) => c.status === 'Hot Lead').length,
    bookings: today.filter((c) => c.status === 'Booked').length,
  };
}

/* ── Integrations ────────────────────────────────────────────────── */

export async function listIntegrations(businessId: string): Promise<Integration[]> {
  if (!hasSupabase) return mem().integrations.filter((i) => i.business_id === businessId);
  const { data, error } = await db().from('business_integrations').select('*').eq('business_id', businessId);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: String(r.id), business_id: String(r.business_id), provider: String(r.provider),
    is_connected: Boolean(r.is_connected), api_key: r.api_key ?? null,
    meta: (r.meta as Record<string, unknown>) ?? {},
  }));
}

export async function setIntegration(
  businessId: string, provider: string, isConnected: boolean, apiKey?: string
): Promise<Integration> {
  if (!hasSupabase) {
    const m = mem();
    const i = m.integrations.findIndex((x) => x.business_id === businessId && x.provider === provider);
    const rec: Integration = {
      id: i >= 0 ? m.integrations[i].id : uuid(),
      business_id: businessId, provider, is_connected: isConnected,
      api_key: apiKey ?? (i >= 0 ? m.integrations[i].api_key : null), meta: {},
    };
    if (i >= 0) m.integrations[i] = rec; else m.integrations.push(rec);
    return rec;
  }
  const { data, error } = await db().from('business_integrations').upsert(
    {
      business_id: businessId, provider, is_connected: isConnected,
      ...(apiKey !== undefined ? { api_key: apiKey } : {}),
      updated_at: nowIso(),
    },
    { onConflict: 'business_id,provider' }
  ).select().single();
  if (error) throw error;
  return {
    id: String(data.id), business_id: String(data.business_id), provider: String(data.provider),
    is_connected: Boolean(data.is_connected), api_key: data.api_key ?? null,
    meta: (data.meta as Record<string, unknown>) ?? {},
  };
}

export type { VibeKey };
