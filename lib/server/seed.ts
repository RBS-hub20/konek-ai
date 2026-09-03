import type { BusinessRow, SkillRow } from '@/lib/types';

/* Mirrors the seed block in supabase.sql, so the API returns the same eight
   skills whether or not a database is connected. */
export const SEED_SKILLS: SkillRow[] = [
  { id: 'closer', name: 'Closer Skill', description: 'Expert at handling objections and driving every call to a yes', category: 'sales', vibe: 'PRO CLOSER', system_prompt: 'You are a pro closer. When the customer says they will think about it, or that the price is high, handle the objection with confidence and close. Offer installments or hold the slot. Always finish with a two-option question, never a yes/no.', is_active: true },
  { id: 'followup', name: 'Follow-up Skill', description: 'Calls warm leads back on schedule', category: 'sales', vibe: 'FRIENDLY TITO', system_prompt: 'You follow up politely with leads who did not answer or asked to be called back. Retry at +4 hours, +1 day, then +3 days and stop. Never more than four attempts. Honour any opt-out immediately.', is_active: true },
  { id: 'upsell', name: 'Upsell Skill', description: 'Offers add-on after yes', category: 'sales', vibe: 'PRO CLOSER', system_prompt: 'After the customer has committed, offer one natural add-on that genuinely improves their result. Make exactly one offer. If declined, move on warmly and re-confirm the original booking.', is_active: true },
  { id: 'booking', name: 'Booking Skill', description: 'Books appointments to calendar', category: 'support', vibe: 'CALM CARE', system_prompt: 'You book appointments. Offer two concrete slots, confirm the name and number, write the booking, then confirm by SMS. Never offer a slot you have not checked.', is_active: true },
  { id: 'faq', name: 'FAQ Skill', description: 'Answers product questions from brain', category: 'support', vibe: 'FRIENDLY TITO', system_prompt: 'Answer using the Business Brain knowledge only. If the answer is not in the knowledge you were given, say you do not want to guess and that someone from the team will confirm. Never invent prices, hours or policies.', is_active: true },
  { id: 'collection', name: 'Collection Skill', description: 'Polite payment reminder', category: 'support', vibe: 'CALM CARE', system_prompt: 'Remind the customer about an overdue balance politely but firmly. Offer to settle in full or split the payment. Never threaten. Always leave a payment link by SMS.', is_active: true },
  { id: 'winback', name: 'Winback Skill', description: 'Calls old customers with offer', category: 'marketing', vibe: 'GEN-Z HYPE', system_prompt: 'Win back customers who have not purchased in 90 days with a genuine returning-customer offer. One call per quarter, maximum.', is_active: true },
  { id: 'review', name: 'Review Skill', description: 'Asks for 5-star review', category: 'marketing', vibe: 'FRIENDLY TITO', system_prompt: '24 hours after a completed service, ask how it went on a scale of one to ten. If 9 or 10, send the review link while still on the call. If 8 or below, skip the link, capture the reason and flag it for the owner.', is_active: true },
];

/** Stable id for the single demo tenant used before a real DB is connected. */
export const DEMO_BUSINESS_ID = '00000000-0000-4000-8000-000000000001';

export const DEMO_BUSINESS: BusinessRow = {
  id: DEMO_BUSINESS_ID,
  name: 'Nova Aesthetics',
  owner_email: 'bianca@novaaesthetics.ph',
  owner_name: 'Bianca Salvador',
  what_you_sell: 'Skin treatments, facials and aftercare packages',
  price: '₱2,500 – ₱12,800',
  goal: 'book',
  vibe: 'PRO CLOSER',
  plan: 'pro',
  calls_used: 1840,
  calls_limit: 2000,
  status: 'active',
  mrr: 149,
  twilio_number: '+63 917 000 8642',
  whatsapp_enabled: true,
  created_at: new Date('2025-01-12').toISOString(),
};

export const DEFAULT_ENABLED_SKILLS = ['booking', 'faq'];
