/* Row shapes for the v2 multi-tenant schema (supabase.sql). */

export const VIBE_KEYS = ['PRO_CLOSER', 'FRIENDLY_TITO', 'GEN_Z_HYPE', 'CALM_CARE'] as const;
export type VibeKey = (typeof VIBE_KEYS)[number];

/** UI shows "PRO CLOSER"; the database stores "PRO_CLOSER". */
export const vibeToKey = (v: string): VibeKey => {
  const k = v.trim().toUpperCase().replace(/[\s-]+/g, '_') as VibeKey;
  return VIBE_KEYS.includes(k) ? k : 'PRO_CLOSER';
};
export const vibeToLabel = (v: string): string => vibeToKey(v).replace(/_/g, ' ');

export type CallStatus =
  | 'Initiated' | 'Connected' | 'Hot Lead' | 'Booked'
  | 'Completed' | 'Follow-up' | 'No Answer' | 'Failed';

export const HANDOFF_MODES = ['ai_only', 'if_interested', 'on_request'] as const;
export type HandoffMode = (typeof HANDOFF_MODES)[number];

export const HANDOFF_MODE_LABELS: Record<HandoffMode, { label: string; detail: string }> = {
  ai_only: { label: 'AI only', detail: 'Never transfer. KONEK offers a callback instead.' },
  if_interested: { label: 'Transfer when interested', detail: 'Hand over as soon as the customer shows buying intent, and whenever they ask.' },
  on_request: { label: 'Transfer on request', detail: 'Only when the customer asks for a person.' },
};

export interface Service {
  id: string;
  business_id: string;
  name: string;
  price: string | null;
  description: string | null;
  duration: string | null;
  category: string | null;
  is_active: boolean;
  sort_order: number;
}

export interface BusinessSettings {
  whatsapp_followup?: boolean;
  sms_fallback?: boolean;
  [k: string]: unknown;
}

export interface Business {
  id: string;
  name: string;
  slug: string | null;
  owner_email: string | null;
  owner_name: string | null;
  outbound_number: string | null;
  plan: string;
  calls_used: number;
  calls_limit: number;
  status: string;
  mrr: number;
  active_vibe: string;
  language: string;
  /** Mirror the caller's language mid-call. */
  auto_language: boolean;
  /** Where to transfer a caller who asks for a person. */
  handoff_number: string | null;
  handoff_backup: string | null;
  handoff_enabled: boolean;
  handoff_mode: HandoffMode;
  industry: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  hours: string | null;
  logo_url: string | null;
  /** Null until the onboarding wizard is finished. */
  onboarded_at: string | null;
  settings: BusinessSettings;
  created_at: string;
}

export interface KnowledgeFile {
  name: string;
  url?: string;
  size?: number;
  type?: string;
  uploaded_at?: string;
}

export interface BusinessBrain {
  id: string;
  business_id: string;
  business_name: string | null;
  what_you_sell: string | null;
  price_range: string | null;
  goal: 'Explain' | 'Book' | 'Close';
  knowledge_files: KnowledgeFile[];
  website_link: string | null;
  updated_at: string;
}

export interface Campaign {
  id: string;
  business_id: string;
  name: string;
  vibe: VibeKey;
  status: 'Running' | 'Completed' | 'Scheduled' | 'Paused';
  audience_count: number;
  called_count: number;
  hot_leads: number;
  skills: string[];
  created_at: string;
}

export interface Contact {
  id: string;
  campaign_id: string | null;
  business_id: string;
  name: string | null;
  phone: string;
  status: string;
  custom_fields: Record<string, unknown>;
  created_at: string;
}

export interface CallLog {
  id: string;
  business_id: string | null;
  campaign_id: string | null;
  contact_id: string | null;
  customer_name: string | null;
  phone: string | null;
  skills_used: string[];
  vibe: string | null;
  /** The language actually spoken by the end of the call. */
  language: string | null;
  transferred_to: string | null;
  transfer_status: string | null;
  duration_seconds: number;
  status: CallStatus | string;
  recording_url: string | null;
  transcript: string | null;
  twilio_sid: string | null;
  /** The outbound script Cindy read, when the call was set up with one. */
  script_id: string | null;
  created_at: string;
}

export interface SkillRecord {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  vibe: string | null;
  system_prompt: string;
  script: string | null;
  business_id: string | null; // null = global ready-made
  is_active: boolean;         // per-business toggle, joined from business_skills
}

export interface Integration {
  id: string;
  business_id: string;
  provider: string;
  is_connected: boolean;
  api_key: string | null;
  meta: Record<string, unknown>;
}

export interface OverviewStats {
  callsToday: number;
  connectedPct: number;
  hotLeads: number;
  bookings: number;
}

/* ── Outbound sales ─────────────────────────────────────────────── */

export const LEAD_STATUSES = [
  'New', 'Calling', 'Interested', 'Transferred', 'Not interested', 'No answer', 'Closed',
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export interface Lead {
  id: string;
  company: string | null;
  contact_person: string | null;
  name: string | null;
  phone: string;
  industry: string | null;
  country: string | null;
  status: string;
  notes: string | null;
  call_count: number;
  last_called_at: string | null;
  twilio_sid: string | null;
  created_at: string;
}

export interface SalesSettings {
  manager_number: string | null;
  backup_number: string | null;
  whisper: boolean;
}

/* ── Outbound scripts ───────────────────────────────────────────── */

export const SCRIPT_STEPS = ['opener', 'discovery', 'pitch', 'close'] as const;
export type ScriptStepName = (typeof SCRIPT_STEPS)[number];

export const SCRIPT_INDUSTRIES = ['laundry', 'restaurant', 'cafe', 'salon', 'clinic', 'gym', 'generic'] as const;
export const SCRIPT_VIBES = ['professional', 'friendly', 'aggressive', 'tita', 'enterprise', 'casual'] as const;
export const SCRIPT_COUNTRIES = ['PH', 'AE', 'ALL'] as const;

export interface ScriptStep {
  step: ScriptStepName;
  /** One language per script — the country already chose it. */
  text?: string;
  /** Kept for scripts written before the split was removed. */
  text_ph?: string;
  text_ae?: string;
  /** Silence after this step, rendered as sentence breaks for the voice. */
  pause_ms: number;
}

/** The line for a step, whichever shape the script was written in. */
export function stepText(step: ScriptStep | undefined, country?: string | null): string {
  if (!step) return '';
  if (step.text?.trim()) return step.text;
  const ph = (country ?? '').toUpperCase() === 'PH';
  return (ph ? step.text_ph : step.text_ae) || step.text_ph || step.text_ae || '';
}

export interface VoiceSettings {
  speed: number;
  emotion: string;
  pause_ms: number;
  barge_in?: boolean;
  /** PH-direct opens in Taglish, AE-direct in English — never announced. */
  language_mode?: 'PH-direct' | 'AE-direct';
}

export interface OutboundScript {
  id: string;
  /** Ships with the product: editable by copy, not by deletion. */
  is_builtin?: boolean;
  name: string;
  industry: string;
  vibe: string;
  country: string;
  script_steps: ScriptStep[];
  voice_settings: VoiceSettings;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
}

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = { speed: 0.92, emotion: 'professional', pause_ms: 400 };

/** Fills {{company}}, {{contact}} and {{industry}} in a script line. */
export function renderScript(text: string, vars: Record<string, string | null | undefined>): string {
  return String(text ?? '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
    const v = vars[key];
    return v ? String(v) : '';
  }).replace(/\s{2,}/g, ' ').trim();
}
