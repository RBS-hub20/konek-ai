import { db, hasSupabase } from '@/lib/supabase';
import { env } from '@/lib/env';
import type {
  Business, BusinessBrain, CallLog, Campaign, Contact,
  Integration, KnowledgeFile, Lead, OutboundScript, OverviewStats, SalesSettings,
  Service, SkillRecord, VibeKey,
} from '@/lib/types2';
import { DEFAULT_VOICE_SETTINGS } from '@/lib/types2';
import { vibeToKey } from '@/lib/types2';
import { SEED_SKILLS } from './seed';

/* ═══════════════════════════════════════════════════════════════════
   Data access for the v2 multi-tenant schema.
   Supabase when configured; an in-process store otherwise so the whole
   dashboard is still clickable locally. Memory resets on restart, and
   on serverless it is per-instance — never rely on it in production.
   ═══════════════════════════════════════════════════════════════════ */

const log = (msg: string) => console.warn(`[KONEK AI] ${msg}`);

const uuid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const nowIso = () => new Date().toISOString();

interface Mem {
  services: Service[];
  leads: Lead[];
  scripts: OutboundScript[];
  platform: Record<string, Record<string, unknown>>;
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
        language: 'EN',
        auto_language: true,
        handoff_number: null,
        handoff_backup: null,
        handoff_enabled: true,
        handoff_mode: 'on_request',
        industry: null,
        address: null,
        city: null,
        country: null,
        hours: null,
        logo_url: null,
        onboarded_at: null,
        settings: { whatsapp_followup: true, sms_fallback: true },
        created_at: nowIso(),
      }],
      brains: [{
        id: uuid(), business_id: bizId, business_name: 'Nova Aesthetics',
        what_you_sell: 'Skin treatments, facials and aftercare packages',
        price_range: '₱2,500 – ₱12,800', goal: 'Book',
        knowledge_files: [], website_link: null, updated_at: nowIso(),
      }],
      campaigns: [], contacts: [], callLogs: [], services: [], leads: [], scripts: [],
      platform: { sales: { manager_number: null, backup_number: null, whisper: true } },
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
  language: (b.language as string) ?? 'EN',
  auto_language: b.auto_language !== false,
  handoff_number: (b.handoff_number as string) ?? null,
  handoff_backup: (b.handoff_backup as string) ?? null,
  handoff_enabled: b.handoff_enabled !== false,
  handoff_mode: ((b.handoff_mode as Business['handoff_mode']) ?? 'on_request'),
  industry: (b.industry as string) ?? null,
  address: (b.address as string) ?? null,
  city: (b.city as string) ?? null,
  country: (b.country as string) ?? null,
  hours: (b.hours as string) ?? null,
  logo_url: (b.logo_url as string) ?? null,
  onboarded_at: (b.onboarded_at as string) ?? null,
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
    'calls_used', 'calls_limit', 'status', 'mrr', 'active_vibe', 'language', 'auto_language',
    'handoff_number', 'handoff_backup', 'handoff_enabled', 'handoff_mode',
    'industry', 'address', 'city', 'country', 'hours', 'logo_url', 'onboarded_at',
    'settings',
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
    language: input.language ?? 'EN',
    auto_language: input.auto_language ?? true,
    handoff_number: input.handoff_number ?? null,
    handoff_backup: input.handoff_backup ?? null,
    handoff_enabled: input.handoff_enabled ?? true,
    handoff_mode: input.handoff_mode ?? 'on_request',
    industry: input.industry ?? null,
    address: input.address ?? null,
    city: input.city ?? null,
    country: input.country ?? null,
    hours: input.hours ?? null,
    logo_url: input.logo_url ?? null,
    onboarded_at: input.onboarded_at ?? null,
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

/** Removes a tenant. Child rows are re-pointed by the caller first. */
export async function deleteBusiness(id: string): Promise<void> {
  if (!hasSupabase) {
    const m = mem();
    m.businesses = m.businesses.filter((b) => b.id !== id);
    delete m.enabled[id];
    m.brains = m.brains.filter((b) => b.business_id !== id);
    m.campaigns = m.campaigns.filter((c) => c.business_id !== id);
    m.contacts = m.contacts.filter((c) => c.business_id !== id);
    m.callLogs = m.callLogs.filter((c) => c.business_id !== id);
    m.integrations = m.integrations.filter((i) => i.business_id !== id);
    return;
  }
  const { error } = await db().from('businesses').delete().eq('id', id);
  if (error) throw error;
}

/** Moves every child row from one tenant to another, in memory. */
export function reassignInMemory(fromId: string, toId: string): Record<string, number> {
  const m = mem();
  const moved: Record<string, number> = {};
  const move = <T extends { business_id: string }>(rows: T[], name: string) => {
    let n = 0;
    for (const r of rows) if (r.business_id === fromId) { r.business_id = toId; n++; }
    if (n) moved[name] = n;
  };
  move(m.callLogs as unknown as { business_id: string }[], 'call_logs');
  move(m.campaigns as unknown as { business_id: string }[], 'campaigns');
  move(m.contacts as unknown as { business_id: string }[], 'contacts');
  move(m.brains as unknown as { business_id: string }[], 'business_brain');
  move(m.integrations as unknown as { business_id: string }[], 'business_integrations');
  return moved;
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
  language: (r.language as string) ?? null,
  transferred_to: (r.transferred_to as string) ?? null,
  transfer_status: (r.transfer_status as string) ?? null,
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
    language: input.language ?? null,
    transferred_to: input.transferred_to ?? null,
    transfer_status: input.transfer_status ?? null,
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

/* ── Services / menu ─────────────────────────────────────────────── */

const normalizeService = (r: Record<string, unknown>): Service => ({
  id: String(r.id),
  business_id: String(r.business_id),
  name: String(r.name ?? ''),
  price: (r.price as string) ?? null,
  description: (r.description as string) ?? null,
  duration: (r.duration as string) ?? null,
  category: (r.category as string) ?? null,
  is_active: r.is_active !== false,
  sort_order: Number(r.sort_order ?? 0),
});

export async function listServices(businessId: string): Promise<Service[]> {
  if (!hasSupabase) {
    return mem().services.filter((s) => s.business_id === businessId)
      .sort((a, b) => a.sort_order - b.sort_order);
  }
  const { data, error } = await db().from('services').select('*')
    .eq('business_id', businessId).order('sort_order');
  if (error) throw error;
  return (data ?? []).map(normalizeService);
}

export async function createService(businessId: string, input: Partial<Service>): Promise<Service> {
  const existing = await safe(() => listServices(businessId), []);
  const row = {
    business_id: businessId,
    name: input.name ?? 'Untitled',
    price: input.price ?? null,
    description: input.description ?? null,
    duration: input.duration ?? null,
    category: input.category ?? null,
    is_active: input.is_active ?? true,
    sort_order: input.sort_order ?? existing.length,
  };
  if (!hasSupabase) {
    const created = normalizeService({ ...row, id: uuid() });
    mem().services.push(created);
    return created;
  }
  const { data, missingTable, error } = await insertResilient<Record<string, unknown>>(db(), 'services', row);
  if (missingTable) throw new Error('The services table does not exist. Run supabase.sql.');
  if (!data) throw error ?? new Error('Could not insert the service');
  return normalizeService(data);
}

export async function updateService(id: string, patch: Partial<Service>): Promise<Service | null> {
  const allowed = ['name', 'price', 'description', 'duration', 'category', 'is_active', 'sort_order'] as const;
  const clean: Record<string, unknown> = {};
  for (const k of allowed) if (k in patch && patch[k] !== undefined) clean[k] = patch[k];

  if (!hasSupabase) {
    const m = mem();
    const i = m.services.findIndex((s) => s.id === id);
    if (i === -1) return null;
    m.services[i] = { ...m.services[i], ...(clean as Partial<Service>) };
    return m.services[i];
  }
  const { data, error } = await db().from('services').update(clean).eq('id', id).select().maybeSingle();
  if (error) throw error;
  return data ? normalizeService(data) : null;
}

export async function deleteService(id: string): Promise<void> {
  if (!hasSupabase) {
    const m = mem();
    m.services = m.services.filter((s) => s.id !== id);
    return;
  }
  const { error } = await db().from('services').delete().eq('id', id);
  if (error) throw error;
}

/** Bulk insert, used by the onboarding wizard. */
export async function replaceServices(businessId: string, rows: Partial<Service>[]): Promise<Service[]> {
  const current = await safe(() => listServices(businessId), []);
  for (const c of current) await safe(() => deleteService(c.id), undefined);
  const created: Service[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    created.push(await createService(businessId, { ...r, sort_order: i }));
  }
  return created;
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

/* ── Resilient helpers used by the call path ─────────────────────── */

import { insertResilient, updateResilient, upsertResilient, isMissingTable, type PgError } from './resilient';

/** Runs a loader but never lets it break the call. */
export async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

export interface ResolvedBusiness {
  business: Business;
  /** true when the row is synthesised because the table is missing/unwritable. */
  ephemeral: boolean;
  note?: string;
}

function fallbackBusiness(): Business {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Nova Aesthetics',
    slug: 'nova-aesthetics',
    owner_email: null,
    owner_name: null,
    outbound_number: env.twilioNumber || null,
    plan: 'pro',
    calls_used: 0,
    calls_limit: 2000,
    status: 'active',
    mrr: 149,
    active_vibe: 'PRO_CLOSER',
    language: 'EN',
    auto_language: true,
    handoff_number: null,
    handoff_backup: null,
    handoff_enabled: true,
    handoff_mode: 'on_request',
    industry: null,
    address: null,
    city: null,
    country: null,
    hours: null,
    logo_url: null,
    onboarded_at: null,
    settings: { whatsapp_followup: true, sms_fallback: true },
    created_at: nowIso(),
  };
}

/**
 * Read-only tenant lookup. NEVER writes — dashboard pages call this on every
 * load, and an auto-creating read would mint a new business per request.
 * Falls back to a synthetic tenant so a page can still render.
 */
export async function getBusinessForRead(id?: string | null): Promise<ResolvedBusiness> {
  if (!hasSupabase) {
    const b = await getBusiness(id);
    return { business: b ?? fallbackBusiness(), ephemeral: !b };
  }
  try {
    const q = db().from('businesses').select('*');
    const { data, error } = id
      ? await q.eq('id', id).limit(1).maybeSingle()
      : await q.order('created_at', { ascending: true }).limit(1).maybeSingle();

    if (!error && data) return { business: normalizeBusiness(data), ephemeral: false };
    return {
      business: fallbackBusiness(),
      ephemeral: true,
      note: error
        ? `Could not read businesses: ${(error as PgError).message}`
        : 'No business rows yet — run supabase.sql, or place a call to create the first tenant.',
    };
  } catch (err) {
    return { business: fallbackBusiness(), ephemeral: true, note: describeErr(err) };
  }
}

const describeErr = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * The tenant to place a call as. May create the first tenant if the table is
 * empty — only the call path is allowed to do that. Never throws: if the table
 * is missing or unwritable a working in-memory tenant is returned, so the phone
 * still rings and only persistence degrades.
 */
export async function resolveBusinessForCall(id?: string | null): Promise<ResolvedBusiness> {
  if (!hasSupabase) {
    const b = await getBusiness(id);
    return { business: b ?? fallbackBusiness(), ephemeral: !b };
  }

  /* 1 · Read whatever is there — select('*'), never named columns. */
  try {
    const q = db().from('businesses').select('*');
    const { data, error } = id
      ? await q.eq('id', id).limit(1).maybeSingle()
      : await q.limit(1).maybeSingle();

    if (!error && data) return { business: normalizeBusiness(data), ephemeral: false };
    if (error && !isMissingTable(error as PgError)) {
      /* A real query error (not a missing table) still should not block a call. */
      return {
        business: fallbackBusiness(),
        ephemeral: true,
        note: `Could not read businesses: ${(error as PgError).message}`,
      };
    }
    if (error && isMissingTable(error as PgError)) {
      return {
        business: fallbackBusiness(),
        ephemeral: true,
        note: 'The businesses table does not exist yet — using a temporary tenant.',
      };
    }
  } catch (err) {
    return {
      business: fallbackBusiness(),
      ephemeral: true,
      note: err instanceof Error ? err.message : String(err),
    };
  }

  /* 2 · Table exists but looked empty — re-check, then seed once.
     Two requests can race here; the second one finds the first one's row. */
  try {
    const { data: again } = await db()
      .from('businesses')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (again) return { business: normalizeBusiness(again), ephemeral: false };
  } catch {
    /* fall through to the insert */
  }

  const seed = fallbackBusiness();
  const { data, dropped, missingTable } = await insertResilient<Record<string, unknown>>(
    db(),
    'businesses',
    {
      name: seed.name,
      slug: seed.slug,
      /* v1 declared owner_email NOT NULL, so always send something. */
      owner_email: 'owner@konek.ai',
      outbound_number: seed.outbound_number,
      phone_number: seed.outbound_number,
      plan: seed.plan,
      calls_used: 0,
      calls_limit: seed.calls_limit,
      status: 'active',
      mrr: seed.mrr,
      active_vibe: 'PRO_CLOSER',
      vibe: 'PRO_CLOSER',
      language: 'EN',
      auto_language: true,
      settings: seed.settings,
    }
  );

  if (data) {
    return {
      business: normalizeBusiness(data),
      ephemeral: false,
      ...(dropped.length ? { note: `Created the default business; this table has no ${dropped.join(', ')} column.` } : {}),
    };
  }

  return {
    business: seed,
    ephemeral: true,
    note: missingTable
      ? 'The businesses table does not exist yet — using a temporary tenant.'
      : 'Could not create the default business — using a temporary tenant.',
  };
}

/**
 * Best-effort call logging. Writes both naming conventions (phone/phone_number/
 * to_number, customer_name/name) and drops whatever the table lacks, so a
 * schema gap can never fail a call that already connected.
 */
export async function logCall(row: {
  business_id?: string | null;
  campaign_id?: string | null;
  contact_id?: string | null;
  phone: string;
  from_number?: string | null;
  customer_name?: string | null;
  vibe?: string | null;
  language?: string | null;
  status?: string;
  skills_used?: string[];
  twilio_sid?: string | null;
}): Promise<{ id: string | null; dropped: string[]; error: string | null }> {
  if (!hasSupabase) {
    const created = await createCallLog({
      business_id: row.business_id ?? null,
      campaign_id: row.campaign_id ?? null,
      contact_id: row.contact_id ?? null,
      customer_name: row.customer_name ?? null,
      phone: row.phone,
      vibe: row.vibe ?? null,
      status: row.status ?? 'Initiated',
      skills_used: row.skills_used ?? [],
      twilio_sid: row.twilio_sid ?? null,
    });
    return { id: created.id, dropped: [], error: null };
  }

  const { data, dropped, missingTable, error } = await insertResilient<{ id: string }>(
    db(),
    'call_logs',
    {
      business_id: row.business_id ?? null,
      campaign_id: row.campaign_id ?? null,
      contact_id: row.contact_id ?? null,
      /* Both naming conventions — whichever the table has will land. */
      phone: row.phone,
      phone_number: row.phone,
      to_number: row.phone,
      from_number: row.from_number ?? null,
      customer_name: row.customer_name ?? null,
      name: row.customer_name ?? null,
      vibe: row.vibe ?? null,
      language: row.language ?? null,
      status: row.status ?? 'Initiated',
      skills_used: row.skills_used ?? [],
      duration_seconds: 0,
      twilio_sid: row.twilio_sid ?? null,
    }
  );

  return {
    id: data?.id ?? null,
    dropped,
    error: missingTable
      ? 'The call_logs table does not exist yet.'
      : error
        ? (error.message ?? 'Insert failed')
        : null,
  };
}

/* ── Outbound sales leads ────────────────────────────────────────── */

const normalizeLead = (r: Record<string, unknown>): Lead => ({
  id: String(r.id),
  company: (r.company as string) ?? null,
  contact_person: (r.contact_person as string) ?? null,
  name: (r.name as string) ?? null,
  phone: String(r.phone ?? ''),
  industry: (r.industry as string) ?? null,
  country: (r.country as string) ?? null,
  status: (r.status as string) ?? 'New',
  notes: (r.notes as string) ?? null,
  call_count: Number(r.call_count ?? 0),
  last_called_at: (r.last_called_at as string) ?? null,
  twilio_sid: (r.twilio_sid as string) ?? null,
  created_at: (r.created_at as string) ?? nowIso(),
});

export async function listLeads(limit = 200): Promise<Lead[]> {
  if (!hasSupabase) return mem().leads.slice(0, limit);
  const { data, error } = await db().from('leads').select('*')
    .order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []).map(normalizeLead);
}

export async function getLead(id: string): Promise<Lead | null> {
  if (!hasSupabase) return mem().leads.find((l) => l.id === id) ?? null;
  const { data, error } = await db().from('leads').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? normalizeLead(data) : null;
}

export async function createLead(input: Partial<Lead>): Promise<Lead> {
  const row = {
    company: input.company ?? null,
    contact_person: input.contact_person ?? null,
    name: input.contact_person ?? input.name ?? null,
    phone: input.phone ?? '',
    industry: input.industry ?? null,
    country: input.country ?? null,
    status: input.status ?? 'New',
    notes: input.notes ?? null,
    call_count: 0,
  };
  if (!hasSupabase) {
    const created = normalizeLead({ ...row, id: uuid(), created_at: nowIso() });
    mem().leads.unshift(created);
    return created;
  }
  /* This table may predate the code writing to it, so unknown columns are
     dropped rather than failing the insert. */
  const { data, dropped, missingTable, error } = await insertResilient<Record<string, unknown>>(db(), 'leads', row);
  if (missingTable) throw new Error('The leads table does not exist. Run supabase.sql.');
  if (!data) throw error ?? new Error('Could not insert the lead');
  if (dropped.length) log(`leads: wrote without ${dropped.join(', ')}`);
  return normalizeLead(data);
}

export async function updateLead(id: string, patch: Partial<Lead>): Promise<Lead | null> {
  const allowed = ['company', 'contact_person', 'name', 'phone', 'industry', 'country',
    'status', 'notes', 'call_count', 'last_called_at', 'twilio_sid'] as const;
  const clean: Record<string, unknown> = {};
  for (const k of allowed) if (k in patch && patch[k] !== undefined) clean[k] = patch[k];

  if (!hasSupabase) {
    const m = mem();
    const i = m.leads.findIndex((l) => l.id === id);
    if (i === -1) return null;
    m.leads[i] = { ...m.leads[i], ...(clean as Partial<Lead>) };
    return m.leads[i];
  }
  const { data, error } = await updateResilient<Record<string, unknown>>(db(), 'leads', { id }, clean);
  if (error) throw error;
  return data ? normalizeLead(data) : null;
}

export async function deleteLead(id: string): Promise<void> {
  if (!hasSupabase) {
    const m = mem();
    m.leads = m.leads.filter((l) => l.id !== id);
    return;
  }
  const { error } = await db().from('leads').delete().eq('id', id);
  if (error) throw error;
}

export async function findLeadByTwilioSid(sid: string): Promise<Lead | null> {
  if (!hasSupabase) return mem().leads.find((l) => l.twilio_sid === sid) ?? null;
  const { data, error } = await db().from('leads').select('*').eq('twilio_sid', sid).maybeSingle();
  if (error) throw error;
  return data ? normalizeLead(data) : null;
}

/* ── Platform settings ───────────────────────────────────────────── */

const DEFAULT_SALES: SalesSettings = { manager_number: null, backup_number: null, whisper: true };

export async function getSalesSettings(): Promise<SalesSettings> {
  if (!hasSupabase) return { ...DEFAULT_SALES, ...(mem().platform.sales as Partial<SalesSettings>) };
  const { data, error } = await db().from('platform_settings').select('value').eq('key', 'sales').maybeSingle();
  if (error) throw error;
  return { ...DEFAULT_SALES, ...((data?.value as Partial<SalesSettings>) ?? {}) };
}

export async function saveSalesSettings(patch: Partial<SalesSettings>): Promise<SalesSettings> {
  const merged = { ...(await getSalesSettings()), ...patch };
  if (!hasSupabase) {
    mem().platform.sales = merged as unknown as Record<string, unknown>;
    return merged;
  }
  const { missingTable, error } = await upsertResilient(
    db(),
    'platform_settings',
    { key: 'sales', value: merged, updated_at: nowIso() },
    'key'
  );
  if (missingTable) throw new Error('The platform_settings table does not exist. Run supabase.sql.');
  if (error) throw error;
  return merged;
}

/* ── Outbound scripts ────────────────────────────────────────────── */

const normalizeScript = (r: Record<string, unknown>): OutboundScript => ({
  id: String(r.id),
  name: String(r.name ?? 'Untitled script'),
  industry: (r.industry as string) ?? 'generic',
  vibe: (r.vibe as string) ?? 'professional',
  country: (r.country as string) ?? 'ALL',
  script_steps: Array.isArray(r.script_steps) ? (r.script_steps as OutboundScript['script_steps']) : [],
  voice_settings: { ...DEFAULT_VOICE_SETTINGS, ...((r.voice_settings as object) ?? {}) },
  is_active: r.is_active !== false,
  is_default: r.is_default === true,
  created_at: (r.created_at as string) ?? nowIso(),
});

export async function listScripts(): Promise<OutboundScript[]> {
  if (!hasSupabase) return mem().scripts;
  const { data, error } = await db().from('outbound_scripts').select('*').order('created_at');
  if (error) throw error;
  return (data ?? []).map(normalizeScript);
}

export async function getScript(id: string): Promise<OutboundScript | null> {
  if (!hasSupabase) return mem().scripts.find((s) => s.id === id) ?? null;
  const { data, error } = await db().from('outbound_scripts').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? normalizeScript(data) : null;
}

export async function saveScript(input: Partial<OutboundScript>): Promise<OutboundScript> {
  const row: Record<string, unknown> = {
    name: input.name ?? 'Untitled script',
    industry: input.industry ?? 'generic',
    vibe: input.vibe ?? 'professional',
    country: input.country ?? 'ALL',
    script_steps: input.script_steps ?? [],
    voice_settings: { ...DEFAULT_VOICE_SETTINGS, ...(input.voice_settings ?? {}) },
    is_active: input.is_active ?? true,
    is_default: input.is_default ?? false,
  };

  if (!hasSupabase) {
    const m = mem();
    if (input.id) {
      const i = m.scripts.findIndex((s) => s.id === input.id);
      if (i >= 0) {
        m.scripts[i] = { ...m.scripts[i], ...(row as Partial<OutboundScript>), id: input.id };
        return m.scripts[i];
      }
    }
    const created = normalizeScript({ ...row, id: uuid(), created_at: nowIso() });
    m.scripts.push(created);
    return created;
  }

  if (input.id) {
    const { data, error } = await updateResilient<Record<string, unknown>>(db(), 'outbound_scripts', { id: input.id }, row);
    if (error) throw error;
    if (data) return normalizeScript(data);
  }
  const { data, missingTable, error } = await insertResilient<Record<string, unknown>>(db(), 'outbound_scripts', row);
  if (missingTable) throw new Error('The outbound_scripts table does not exist. Run supabase.sql.');
  if (!data) throw error ?? new Error('Could not save the script');
  return normalizeScript(data);
}

export async function deleteScript(id: string): Promise<void> {
  if (!hasSupabase) {
    const m = mem();
    m.scripts = m.scripts.filter((s) => s.id !== id);
    return;
  }
  const { error } = await db().from('outbound_scripts').delete().eq('id', id);
  if (error) throw error;
}

/** Only one default per industry and country, so clear the others first. */
export async function setDefaultScript(id: string): Promise<OutboundScript | null> {
  const script = await getScript(id);
  if (!script) return null;
  const all = await listScripts();
  for (const other of all) {
    if (other.id === id) continue;
    if (other.industry === script.industry && other.country === script.country && other.is_default) {
      await safe(() => saveScript({ ...other, is_default: false }), null as unknown as OutboundScript);
    }
  }
  return saveScript({ ...script, is_default: true });
}

/**
 * The script a call should use: an active default for this industry and
 * country, then the same industry anywhere, then a generic one. Falling back
 * rather than failing means a lead in a new industry still gets called.
 */
export async function pickScript(industry?: string | null, country?: string | null): Promise<OutboundScript | null> {
  const all = (await safe(() => listScripts(), [])).filter((s) => s.is_active);
  if (!all.length) return null;
  const ind = (industry ?? 'generic').toLowerCase();
  const ctry = (country ?? 'ALL').toUpperCase();

  const rank = (s: OutboundScript) => {
    let score = 0;
    if (s.industry === ind) score += 4;
    else if (s.industry === 'generic') score += 1;
    else return -1;                       // wrong industry entirely
    if (s.country === ctry) score += 3;
    else if (s.country === 'ALL') score += 1;
    else return -1;                       // wrong country entirely
    if (s.is_default) score += 2;
    return score;
  };

  const ranked = all.map((s) => ({ s, score: rank(s) })).filter((r) => r.score >= 0)
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.s ?? null;
}
