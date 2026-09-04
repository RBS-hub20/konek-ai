/* Row shapes for the v2 multi-tenant schema (supabase-v2.sql). */

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
  duration_seconds: number;
  status: CallStatus | string;
  recording_url: string | null;
  transcript: string | null;
  twilio_sid: string | null;
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
