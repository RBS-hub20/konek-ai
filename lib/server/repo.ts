import { db, hasSupabase } from '@/lib/supabase';
import { embed, chunkText } from '@/lib/ai/embeddings';
import type {
  BrainRow,
  BusinessRow,
  CallRow,
  CustomSkillRow,
  SkillRow,
} from '@/lib/types';
import {
  DEFAULT_ENABLED_SKILLS,
  DEMO_BUSINESS,
  DEMO_BUSINESS_ID,
  SEED_SKILLS,
} from './seed';

/* ═══════════════════════════════════════════════════════════════════
   One data API for the routes. Reads and writes Supabase when it is
   configured; otherwise keeps state in memory for the current server
   process so the product is fully clickable before anyone connects a
   database. Memory state resets when the dev server restarts.
   ═══════════════════════════════════════════════════════════════════ */

interface Memory {
  businesses: BusinessRow[];
  enabled: Record<string, Set<string>>;
  customSkills: CustomSkillRow[];
  calls: CallRow[];
  brain: BrainRow[];
}

const g = globalThis as unknown as { __konek?: Memory };

function mem(): Memory {
  if (!g.__konek) {
    g.__konek = {
      businesses: [{ ...DEMO_BUSINESS }],
      enabled: { [DEMO_BUSINESS_ID]: new Set(DEFAULT_ENABLED_SKILLS) },
      customSkills: [],
      calls: [],
      brain: [],
    };
  }
  return g.__konek;
}

const uuid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const isLive = () => hasSupabase;

/* ── Businesses ──────────────────────────────────────────────────── */

export async function listBusinesses(): Promise<BusinessRow[]> {
  if (!hasSupabase) return mem().businesses;
  const { data, error } = await db().from('businesses').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as BusinessRow[];
}

export async function getBusiness(id?: string): Promise<BusinessRow | null> {
  if (!hasSupabase) {
    const m = mem();
    return m.businesses.find((b) => b.id === (id ?? DEMO_BUSINESS_ID)) ?? m.businesses[0] ?? null;
  }
  const q = db().from('businesses').select('*');
  const { data, error } = id
    ? await q.eq('id', id).maybeSingle()
    : await q.order('created_at', { ascending: true }).limit(1).maybeSingle();
  if (error) throw error;
  return (data as BusinessRow) ?? null;
}

export async function createBusiness(input: Partial<BusinessRow>): Promise<BusinessRow> {
  const row = {
    name: input.name ?? 'Untitled business',
    owner_email: input.owner_email ?? 'owner@example.com',
    owner_name: input.owner_name ?? null,
    what_you_sell: input.what_you_sell ?? null,
    price: input.price ?? null,
    goal: input.goal ?? 'book',
    vibe: input.vibe ?? 'PRO CLOSER',
    plan: input.plan ?? 'starter',
    calls_used: input.calls_used ?? 0,
    calls_limit: input.calls_limit ?? 500,
    status: input.status ?? 'active',
    mrr: input.mrr ?? 49,
    twilio_number: input.twilio_number ?? null,
    whatsapp_enabled: input.whatsapp_enabled ?? true,
  };

  if (!hasSupabase) {
    const created: BusinessRow = { ...row, id: uuid(), created_at: new Date().toISOString() } as BusinessRow;
    mem().businesses.unshift(created);
    mem().enabled[created.id] = new Set(DEFAULT_ENABLED_SKILLS);
    return created;
  }
  const { data, error } = await db().from('businesses').insert(row).select().single();
  if (error) throw error;
  return data as BusinessRow;
}

export async function updateBusiness(id: string, patch: Partial<BusinessRow>): Promise<BusinessRow> {
  const allowed: (keyof BusinessRow)[] = [
    'name', 'owner_email', 'owner_name', 'what_you_sell', 'price', 'goal', 'vibe',
    'plan', 'calls_used', 'calls_limit', 'status', 'mrr', 'twilio_number', 'whatsapp_enabled',
  ];
  const clean: Record<string, unknown> = {};
  for (const k of allowed) if (k in patch && patch[k] !== undefined) clean[k] = patch[k];

  if (!hasSupabase) {
    const m = mem();
    const i = m.businesses.findIndex((b) => b.id === id);
    if (i === -1) throw new Error('Business not found');
    m.businesses[i] = { ...m.businesses[i], ...(clean as Partial<BusinessRow>) };
    return m.businesses[i];
  }
  const { data, error } = await db().from('businesses').update(clean).eq('id', id).select().single();
  if (error) throw error;
  return data as BusinessRow;
}

/* ── Skills ──────────────────────────────────────────────────────── */

export async function listSkills(businessId?: string): Promise<SkillRow[]> {
  const bid = businessId ?? DEMO_BUSINESS_ID;

  if (!hasSupabase) {
    const on = mem().enabled[bid] ?? new Set(DEFAULT_ENABLED_SKILLS);
    return SEED_SKILLS.map((s) => ({ ...s, enabled: on.has(s.id) }));
  }

  const [{ data: skills, error: e1 }, { data: links, error: e2 }] = await Promise.all([
    db().from('skills').select('*').order('category'),
    db().from('business_skills').select('skill_id, is_active').eq('business_id', bid),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;

  const on = new Set((links ?? []).filter((l) => l.is_active).map((l) => l.skill_id as string));
  const rows = ((skills ?? []) as SkillRow[]).map((s) => ({ ...s, enabled: on.has(s.id) }));
  /* Fall back to the seed list if the skills table has not been seeded yet. */
  return rows.length ? rows : SEED_SKILLS.map((s) => ({ ...s, enabled: on.has(s.id) }));
}

export async function setSkillEnabled(
  businessId: string,
  skillId: string,
  enabled: boolean
): Promise<{ skillId: string; enabled: boolean }> {
  if (!hasSupabase) {
    const m = mem();
    const set = (m.enabled[businessId] ??= new Set(DEFAULT_ENABLED_SKILLS));
    if (enabled) set.add(skillId);
    else set.delete(skillId);
    return { skillId, enabled };
  }
  const { error } = await db()
    .from('business_skills')
    .upsert(
      { business_id: businessId, skill_id: skillId, is_active: enabled },
      { onConflict: 'business_id,skill_id' }
    );
  if (error) throw error;
  return { skillId, enabled };
}

/** The system prompts for whatever the business currently has switched on. */
export async function activeSkillPrompts(
  businessId: string,
  only?: string[]
): Promise<Pick<SkillRow, 'id' | 'name' | 'system_prompt'>[]> {
  const all = await listSkills(businessId);
  const chosen = only?.length ? all.filter((s) => only.includes(s.id)) : all.filter((s) => s.enabled);
  return chosen.map((s) => ({ id: s.id, name: s.name, system_prompt: s.system_prompt }));
}

/* ── Custom skills ───────────────────────────────────────────────── */

export async function listCustomSkills(businessId: string): Promise<CustomSkillRow[]> {
  if (!hasSupabase) return mem().customSkills.filter((c) => c.business_id === businessId);
  const { data, error } = await db()
    .from('custom_skills')
    .select('*')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as CustomSkillRow[];
}

export async function createCustomSkill(input: Partial<CustomSkillRow>): Promise<CustomSkillRow> {
  const row = {
    business_id: input.business_id ?? DEMO_BUSINESS_ID,
    name: input.name ?? 'Untitled skill',
    description: input.description ?? null,
    trigger_type: input.trigger_type ?? null,
    trigger_value: input.trigger_value ?? null,
    vibe: input.vibe ?? 'PRO CLOSER',
    system_prompt: input.system_prompt ?? input.description ?? null,
  };
  if (!hasSupabase) {
    const created = { ...row, id: uuid(), created_at: new Date().toISOString() } as CustomSkillRow;
    mem().customSkills.unshift(created);
    return created;
  }
  const { data, error } = await db().from('custom_skills').insert(row).select().single();
  if (error) throw error;
  return data as CustomSkillRow;
}

export async function deleteCustomSkill(id: string): Promise<void> {
  if (!hasSupabase) {
    const m = mem();
    m.customSkills = m.customSkills.filter((c) => c.id !== id);
    return;
  }
  const { error } = await db().from('custom_skills').delete().eq('id', id);
  if (error) throw error;
}

/* ── Calls ───────────────────────────────────────────────────────── */

export async function listCalls(businessId?: string, limit = 50): Promise<CallRow[]> {
  if (!hasSupabase) {
    const rows = mem().calls;
    return (businessId ? rows.filter((c) => c.business_id === businessId) : rows).slice(0, limit);
  }
  let q = db().from('calls').select('*').order('created_at', { ascending: false }).limit(limit);
  if (businessId) q = q.eq('business_id', businessId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as CallRow[];
}

export async function createCall(input: Partial<CallRow>): Promise<CallRow> {
  const row = {
    business_id: input.business_id ?? DEMO_BUSINESS_ID,
    customer_name: input.customer_name ?? null,
    customer_phone: input.customer_phone ?? null,
    skills_used: input.skills_used ?? [],
    vibe: input.vibe ?? 'PRO CLOSER',
    duration: input.duration ?? 0,
    status: input.status ?? 'initiated',
    recording_url: input.recording_url ?? null,
    transcript: input.transcript ?? null,
    twilio_sid: input.twilio_sid ?? null,
  };
  if (!hasSupabase) {
    const created = { ...row, id: uuid(), created_at: new Date().toISOString() } as CallRow;
    mem().calls.unshift(created);
    return created;
  }
  const { data, error } = await db().from('calls').insert(row).select().single();
  if (error) throw error;
  return data as CallRow;
}

export async function updateCall(id: string, patch: Partial<CallRow>): Promise<CallRow | null> {
  if (!hasSupabase) {
    const m = mem();
    const i = m.calls.findIndex((c) => c.id === id);
    if (i === -1) return null;
    m.calls[i] = { ...m.calls[i], ...patch };
    return m.calls[i];
  }
  const { data, error } = await db().from('calls').update(patch).eq('id', id).select().maybeSingle();
  if (error) throw error;
  return (data as CallRow) ?? null;
}

export async function findCallByTwilioSid(sid: string): Promise<CallRow | null> {
  if (!hasSupabase) return mem().calls.find((c) => c.twilio_sid === sid) ?? null;
  const { data, error } = await db().from('calls').select('*').eq('twilio_sid', sid).maybeSingle();
  if (error) throw error;
  return (data as CallRow) ?? null;
}

/** Counts a call against the tenant's monthly allowance. */
export async function incrementCallsUsed(businessId: string): Promise<void> {
  const b = await getBusiness(businessId);
  if (!b) return;
  await updateBusiness(businessId, { calls_used: (b.calls_used ?? 0) + 1 });
}

/* ── Business Brain ──────────────────────────────────────────────── */

export async function listBrain(businessId: string): Promise<BrainRow[]> {
  if (!hasSupabase) return mem().brain.filter((b) => b.business_id === businessId);
  const { data, error } = await db()
    .from('business_brain')
    .select('id, business_id, content, source_type, source_name, created_at')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as BrainRow[];
}

export interface BrainInsert {
  businessId: string;
  content: string;
  sourceType?: string;
  sourceName?: string;
}

/** Chunks, embeds (when OpenAI is configured) and stores knowledge. */
export async function addBrain({
  businessId,
  content,
  sourceType = 'manual',
  sourceName,
}: BrainInsert): Promise<{ chunks: number; embedded: number; rows: BrainRow[] }> {
  const chunks = chunkText(content);
  if (!chunks.length) return { chunks: 0, embedded: 0, rows: [] };

  const vectors = await Promise.all(chunks.map((c) => embed(c)));
  const embedded = vectors.filter(Boolean).length;

  if (!hasSupabase) {
    const rows = chunks.map((c, i) => ({
      id: uuid(),
      business_id: businessId,
      content: c,
      source_type: sourceType,
      source_name: sourceName ?? null,
      created_at: new Date(Date.now() + i).toISOString(),
    })) as BrainRow[];
    mem().brain.unshift(...rows);
    return { chunks: chunks.length, embedded, rows };
  }

  const payload = chunks.map((c, i) => ({
    business_id: businessId,
    content: c,
    source_type: sourceType,
    source_name: sourceName ?? null,
    embedding: vectors[i],
  }));
  const { data, error } = await db()
    .from('business_brain')
    .insert(payload)
    .select('id, business_id, content, source_type, source_name, created_at');
  if (error) throw error;
  return { chunks: chunks.length, embedded, rows: (data ?? []) as BrainRow[] };
}

export async function deleteBrainBySource(businessId: string, sourceName: string): Promise<void> {
  if (!hasSupabase) {
    const m = mem();
    m.brain = m.brain.filter((b) => !(b.business_id === businessId && b.source_name === sourceName));
    return;
  }
  const { error } = await db()
    .from('business_brain')
    .delete()
    .eq('business_id', businessId)
    .eq('source_name', sourceName);
  if (error) throw error;
}

/** Knowledge to inject into a call's system prompt. */
export async function brainForPrompt(businessId: string, limit = 20) {
  const rows = await listBrain(businessId);
  return rows.slice(0, limit).map((r) => ({ content: r.content, source_name: r.source_name }));
}
