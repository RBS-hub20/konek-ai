/* Row shapes shared by the API routes and the dashboard. */

export type SkillCategoryDb = 'sales' | 'support' | 'marketing';
export type Goal = 'explain' | 'book' | 'close';
export type Plan = 'starter' | 'pro' | 'enterprise';

export interface BusinessRow {
  id: string;
  name: string;
  owner_email: string;
  owner_name: string | null;
  what_you_sell: string | null;
  price: string | null;
  goal: Goal | null;
  vibe: string | null;
  plan: Plan;
  calls_used: number;
  calls_limit: number;
  status: string;
  mrr: number;
  twilio_number: string | null;
  whatsapp_enabled: boolean;
  created_at: string;
}

export interface SkillRow {
  id: string;
  name: string;
  description: string | null;
  category: SkillCategoryDb;
  vibe: string | null;
  system_prompt: string;
  is_active: boolean;
  /** Joined from business_skills for a given business. */
  enabled?: boolean;
}

export interface CustomSkillRow {
  id: string;
  business_id: string;
  name: string;
  description: string | null;
  trigger_type: string | null;
  trigger_value: string | null;
  vibe: string | null;
  system_prompt: string | null;
  created_at: string;
}

export interface CallRow {
  id: string;
  business_id: string;
  customer_name: string | null;
  customer_phone: string | null;
  skills_used: string[] | null;
  vibe: string | null;
  duration: number;
  status: string;
  recording_url: string | null;
  transcript: string | null;
  twilio_sid: string | null;
  created_at: string;
}

export interface BrainRow {
  id: string;
  business_id: string;
  content: string;
  source_type: string | null;
  source_name: string | null;
  created_at: string;
}

export interface ApiError {
  error: string;
  detail?: string;
}
