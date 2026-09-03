import {
  ArrowUp,
  Calendar,
  Clock,
  DollarSign,
  Heart,
  MessageCircle,
  Star,
  Target,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';

/* ── Vibes ───────────────────────────────────────────────────────── */

export const VIBES = ['PRO CLOSER', 'FRIENDLY TITO', 'GEN-Z HYPE', 'CALM CARE'] as const;
export type Vibe = (typeof VIBES)[number];

export const VIBE_DETAIL: Record<Vibe, { tagline: string; description: string; script: string }> = {
  'PRO CLOSER': {
    tagline: 'Direct. Confident. Closes.',
    description:
      'Executive tone, zero filler. Handles objections head-on and always drives to a decision on the call.',
    script:
      "Hi Marco, this is Kai from Nova Aesthetics. I'll be quick — you asked about the December package. I have two slots left this week and I can hold one under your name right now. Which works better, Thursday 2pm or Friday 11am?",
  },
  'FRIENDLY TITO': {
    tagline: 'Warm. Familiar. Trusted.',
    description:
      'Neighborhood-uncle energy — approachable Taglish warmth that builds instant trust with Filipino customers.',
    script:
      "Hello po, si Kai ito from Nova Aesthetics! Kumusta po kayo? Nakita ko lang po na nag-inquire kayo about sa package namin. Wala pong pressure ha — gusto ko lang malaman kung may tanong pa kayo. Kaya po natin i-reserve yung slot niyo ngayon, libre lang po.",
  },
  'GEN-Z HYPE': {
    tagline: 'Fast. Fun. High energy.',
    description:
      'Punchy, playful and quick — built for DTC brands, drops and anything where energy converts better than formality.',
    script:
      "Heyy it's Kai from Nova — okay so the thing you were eyeing? It's back in stock and honestly it's moving fast. I can lock one for you right now, takes like ten seconds. You want it in black or the cream one?",
  },
  'CALM CARE': {
    tagline: 'Gentle. Patient. Reassuring.',
    description:
      'Unhurried and empathetic. Designed for clinics, care services and any conversation that needs a soft landing.',
    script:
      "Hi Elena, this is Kai calling from Nova Clinic. I hope I'm not catching you at a bad time. I just wanted to check in about your appointment on Tuesday, and answer anything you might be unsure about. Take your time — I'm here.",
  },
};

/* ── Ready-made skills ───────────────────────────────────────────── */

export type SkillCategory = 'SALES' | 'SUPPORT' | 'MARKETING';

export interface Skill {
  id: string;
  name: string;
  description: string;
  category: SkillCategory;
  icon: LucideIcon;
  script: string;
  /* Adoption across every business on KONEK AI — powers Skills Analytics */
  adoption: number;
  callsRun: number;
}

export const READY_MADE_SKILLS: Skill[] = [
  {
    id: 'closer',
    name: 'Closer Skill',
    description: 'Expert at handling objections and driving every call to a yes before hanging up.',
    category: 'SALES',
    icon: Target,
    script:
      'TRIGGER · Customer hesitates or says they need to think about it.\n\nKONEK: "Totally fair — most people want to think it over. Can I ask what is actually holding you back, the price or the timing?"\n\n→ If price: offer the installment plan and free delivery.\n→ If timing: hold the slot free for 48 hours.\n→ Always close with a two-option question, never a yes/no.',
    adoption: 0.87,
    callsRun: 48210,
  },
  {
    id: 'followup',
    name: 'Follow-up Skill',
    description: 'Calls warm leads back on a schedule until they answer or opt out.',
    category: 'SALES',
    icon: Clock,
    script:
      'TRIGGER · No answer, or the customer asked to be called back.\n\nKONEK retries at +4h, +1 day, then +3 days, and stops.\n\n"Hi, it is Kai again from Nova — you mentioned Thursday would be better, so I am keeping my word. Still a good time?"\n\n→ Never more than 4 attempts. Honors opt-out immediately.',
    adoption: 0.79,
    callsRun: 39044,
  },
  {
    id: 'upsell',
    name: 'Upsell Skill',
    description: 'Offers the natural add-on once the customer has already said yes.',
    category: 'SALES',
    icon: TrendingUp,
    script:
      'TRIGGER · Customer has committed to a purchase or booking.\n\nKONEK: "Perfect, you are booked. One thing — clients who add the aftercare kit see about twice the result, and it is 900 instead of 1,400 when bundled today. Want me to include it?"\n\n→ One offer only. If declined, move on warmly and re-confirm the booking.',
    adoption: 0.54,
    callsRun: 18732,
  },
  {
    id: 'booking',
    name: 'Booking Skill',
    description: 'Checks live availability, books the slot and texts the confirmation.',
    category: 'SUPPORT',
    icon: Calendar,
    script:
      'TRIGGER · Customer wants an appointment.\n\nKONEK reads live calendar availability, offers two concrete slots, confirms name and number, writes the booking, then sends an SMS confirmation.\n\n"Locked in — Thursday 2pm with Ana. I am texting the confirmation to this number now. Anything else before I let you go?"',
    adoption: 0.91,
    callsRun: 61980,
  },
  {
    id: 'faq',
    name: 'FAQ Skill',
    description: 'Answers questions straight from your Business Brain, and never invents one.',
    category: 'SUPPORT',
    icon: MessageCircle,
    script:
      'TRIGGER · Any question about hours, pricing, location, policy or products.\n\nKONEK answers only from uploaded knowledge. If the answer is not in the Business Brain:\n\n"That one I do not want to guess on — let me have someone from the team confirm and get right back to you."\n\n→ Flags the knowledge gap in your dashboard so you can fill it.',
    adoption: 0.94,
    callsRun: 72455,
  },
  {
    id: 'collection',
    name: 'Collection Skill',
    description: 'Politely chases an overdue balance and leaves a payment link.',
    category: 'SUPPORT',
    icon: DollarSign,
    script:
      'TRIGGER · Invoice is past due.\n\nKONEK: "Hi Ramon, quick courtesy call from Nova — there is a balance of 4,500 from last month. No trouble at all, I just wanted to make it easy. Would you rather settle in full or split it in two?"\n\n→ Never threatening. Always leaves a payment link by SMS.',
    adoption: 0.38,
    callsRun: 9421,
  },
  {
    id: 'winback',
    name: 'Winback Skill',
    description: 'Calls customers who have gone quiet with a real reason to come back.',
    category: 'MARKETING',
    icon: Heart,
    script:
      'TRIGGER · No purchase or visit in 90 days.\n\nKONEK: "Hi Lea, it is Kai from Nova. It has been a while and honestly we missed you — I have a returning-client rate I can put on your next visit this month. Want me to pencil you in?"\n\n→ One call per quarter, maximum.',
    adoption: 0.61,
    callsRun: 22087,
  },
  {
    id: 'review',
    name: 'Review Skill',
    description: 'Calls happy customers and turns the best ones into public reviews.',
    category: 'MARKETING',
    icon: Star,
    script:
      'TRIGGER · 24 hours after a completed service.\n\nKONEK: "Hi Jomar, just checking how everything went with Tuesday’s session — on a scale of one to ten?"\n\n→ 9–10: text the review link while still on the call.\n→ 1–8: skip the link, capture the reason, flag it for the owner.',
    adoption: 0.47,
    callsRun: 14309,
  },
];

export const SKILL_CATEGORIES: SkillCategory[] = ['SALES', 'SUPPORT', 'MARKETING'];

export const TRIGGER_OPTIONS = ['When customer says...', 'Always do...', 'After call...'] as const;

/* ── Marketing content ───────────────────────────────────────────── */

export const USE_CASES = [
  { name: 'Salon & Spa', vibe: 'FRIENDLY TITO' as Vibe, line: 'Fills empty chairs by calling last month’s clients before the weekend.', metric: '+38% rebookings' },
  { name: 'Real Estate Dubai', vibe: 'PRO CLOSER' as Vibe, line: 'Qualifies portal leads in 90 seconds and books the viewing on the call.', metric: '4.2× more viewings' },
  { name: 'Clinics', vibe: 'CALM CARE' as Vibe, line: 'Confirms appointments and gently reduces no-shows without a receptionist.', metric: '−52% no-shows' },
  { name: 'E-commerce', vibe: 'GEN-Z HYPE' as Vibe, line: 'Recovers abandoned carts with a real call instead of a fifth ignored email.', metric: '19% cart recovery' },
  { name: 'Crypto & FX', vibe: 'PRO CLOSER' as Vibe, line: 'Reactivates dormant traders and routes hot accounts straight to your desk.', metric: '2.7× reactivation' },
  { name: 'Restaurants', vibe: 'FRIENDLY TITO' as Vibe, line: 'Takes reservations and confirms large bookings so tables never sit empty.', metric: '+31% covers' },
] as const;

export const PRICING = [
  {
    name: 'Starter',
    price: '$49',
    period: '/month',
    calls: '500 calls included',
    highlight: false,
    features: ['500 calls per month', '1 phone number', 'All 4 vibes', '3 ready-made skills', 'Recordings & transcripts', 'Email support'],
    cta: 'Start free',
  },
  {
    name: 'Pro',
    price: '$149',
    period: '/month',
    calls: '2,000 calls included',
    highlight: true,
    features: ['2,000 calls per month', '5 phone numbers', 'All 4 vibes', 'Every ready-made skill', 'Custom Skill Builder', 'WhatsApp + CRM integrations', 'Priority support'],
    cta: 'Start free',
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    calls: 'Unlimited calls',
    highlight: false,
    features: ['Unlimited calls', 'Unlimited numbers', 'Private voice cloning', 'Dedicated infrastructure', 'SSO & audit logs', 'Named success manager'],
    cta: 'Talk to sales',
  },
] as const;

export const HOW_IT_WORKS = [
  { step: '01', title: 'Upload Business Brain', body: 'Drop in your menu, price list, PDFs or website. KONEK reads all of it and learns how you actually sell.' },
  { step: '02', title: 'Choose Vibe', body: 'Pick the personality that fits your market — closer, warm tito, gen-z hype or calm care. Switch anytime.' },
  { step: '03', title: 'KONEK Calls & Closes', body: 'Real calls from a real number. It handles objections, books the slot and hands you the hot leads.' },
] as const;

/* ── Business-owner mock data ────────────────────────────────────── */

export interface CallLog {
  id: string;
  customer: string;
  phone: string;
  skills: string[];
  vibe: Vibe;
  duration: string;
  status: 'Hot Lead' | 'Booked' | 'Completed' | 'No Answer' | 'Follow-up';
  seed: number;
  transcript: { speaker: 'KONEK' | 'Customer'; text: string }[];
}

export const CALL_LOGS: CallLog[] = [
  {
    id: 'c-9241', customer: 'Marco Reyes', phone: '+63 917 442 1180',
    skills: ['Closer Skill', 'Booking Skill'], vibe: 'PRO CLOSER', duration: '3:12', status: 'Hot Lead', seed: 21,
    transcript: [
      { speaker: 'KONEK', text: 'Hi Marco, this is Kai from Nova Aesthetics. Quick one — you asked about the December package?' },
      { speaker: 'Customer', text: 'Yeah I did. Honestly it felt a bit expensive though.' },
      { speaker: 'KONEK', text: 'Fair. Is it the total, or the fact that it is all upfront? Because we can split it into three, no interest.' },
      { speaker: 'Customer', text: 'Oh — split works actually. What slots do you have?' },
      { speaker: 'KONEK', text: 'Thursday 2pm or Friday 11am. Which one do I put your name on?' },
      { speaker: 'Customer', text: 'Let us do Thursday.' },
    ],
  },
  {
    id: 'c-9240', customer: 'Elena Cruz', phone: '+63 918 220 5567',
    skills: ['Booking Skill', 'FAQ Skill'], vibe: 'CALM CARE', duration: '2:04', status: 'Booked', seed: 34,
    transcript: [
      { speaker: 'KONEK', text: 'Hi Elena, this is Kai from Nova Clinic. I hope I am not catching you at a bad time.' },
      { speaker: 'Customer', text: 'No it is fine. I wanted to ask about parking actually.' },
      { speaker: 'KONEK', text: 'There is free parking on level B2, and the lift takes you straight to us on 4.' },
      { speaker: 'Customer', text: 'Perfect. Then yes, Tuesday still works.' },
    ],
  },
  {
    id: 'c-9239', customer: 'Jomar Villanueva', phone: '+63 926 771 3390',
    skills: ['Review Skill'], vibe: 'FRIENDLY TITO', duration: '1:26', status: 'Completed', seed: 12,
    transcript: [
      { speaker: 'KONEK', text: 'Hello po Jomar, si Kai ito from Nova. Kumusta po yung session niyo last Tuesday?' },
      { speaker: 'Customer', text: 'Ang ganda! Ten out of ten talaga.' },
      { speaker: 'KONEK', text: 'Maraming salamat po! Ite-text ko lang po yung review link, thirty seconds lang po yun.' },
    ],
  },
  {
    id: 'c-9238', customer: 'Aisha Rahman', phone: '+971 50 118 4402',
    skills: ['Closer Skill', 'Upsell Skill', 'Booking Skill'], vibe: 'PRO CLOSER', duration: '5:47', status: 'Hot Lead', seed: 77,
    transcript: [
      { speaker: 'KONEK', text: 'Aisha, hi — Kai from Marina Heights. You enquired about the two-bed with the canal view.' },
      { speaker: 'Customer', text: 'I did. Is it still available?' },
      { speaker: 'KONEK', text: 'It is, and there are two viewings booked for Saturday. I can get you in ahead of them on Friday evening.' },
      { speaker: 'Customer', text: 'Friday at six?' },
      { speaker: 'KONEK', text: 'Six it is. I am sending the location and the floor plan now.' },
    ],
  },
  {
    id: 'c-9237', customer: 'Ramon Dela Peña', phone: '+63 915 903 7712',
    skills: ['Collection Skill'], vibe: 'CALM CARE', duration: '2:38', status: 'Follow-up', seed: 44,
    transcript: [
      { speaker: 'KONEK', text: 'Hi Ramon, courtesy call from Nova. There is a balance of 4,500 from last month.' },
      { speaker: 'Customer', text: 'Ah yes, sorry. Can I settle it next week?' },
      { speaker: 'KONEK', text: 'Of course. I will text the payment link and check back Monday. No rush.' },
    ],
  },
  {
    id: 'c-9236', customer: 'Lea Bautista', phone: '+63 977 664 2201',
    skills: ['Winback Skill'], vibe: 'GEN-Z HYPE', duration: '0:42', status: 'No Answer', seed: 5,
    transcript: [{ speaker: 'KONEK', text: 'No answer — retrying in 4 hours via Follow-up Skill.' }],
  },
  {
    id: 'c-9235', customer: 'Danilo Ocampo', phone: '+63 920 445 8890',
    skills: ['FAQ Skill', 'Booking Skill'], vibe: 'FRIENDLY TITO', duration: '3:55', status: 'Booked', seed: 63,
    transcript: [
      { speaker: 'KONEK', text: 'Hello po Danilo! Nakita ko lang po na nag-message kayo about sa package.' },
      { speaker: 'Customer', text: 'Opo, magkano po ulit yung premium?' },
      { speaker: 'KONEK', text: '12,800 po, kasama na po yung follow-up session. Gusto niyo po ba i-reserve ko na?' },
      { speaker: 'Customer', text: 'Sige po, Saturday sana.' },
    ],
  },
  {
    id: 'c-9234', customer: 'Grace Lim', phone: '+63 906 332 1145',
    skills: ['Closer Skill', 'Follow-up Skill'], vibe: 'PRO CLOSER', duration: '4:19', status: 'Hot Lead', seed: 88,
    transcript: [
      { speaker: 'KONEK', text: 'Grace, Kai from Nova — you left the checkout at the last step yesterday.' },
      { speaker: 'Customer', text: 'The shipping cost surprised me.' },
      { speaker: 'KONEK', text: 'Understood. Orders over 5,000 ship free and you were 300 short. Want me to add the travel size and clear it?' },
      { speaker: 'Customer', text: 'Yeah, do that.' },
    ],
  },
];

/* ── Super-admin mock data ───────────────────────────────────────── */

export interface Tenant {
  id: string;
  business: string;
  owner: string;
  email: string;
  plan: 'Starter' | 'Pro' | 'Enterprise';
  used: number;
  limit: number;
  status: 'Active' | 'Trial' | 'Paused' | 'Past Due';
  mrr: number;
  country: string;
}

export const TENANTS: Tenant[] = [
  { id: 't-001', business: 'Nova Aesthetics', owner: 'Bianca Salvador', email: 'bianca@novaaesthetics.ph', plan: 'Pro', used: 1840, limit: 2000, status: 'Active', mrr: 149, country: 'PH' },
  { id: 't-002', business: 'Marina Heights Realty', owner: 'Omar Haddad', email: 'omar@marinaheights.ae', plan: 'Enterprise', used: 11420, limit: 15000, status: 'Active', mrr: 2400, country: 'AE' },
  { id: 't-003', business: 'Kwentong Kape', owner: 'Miguel Santos', email: 'miguel@kwentongkape.ph', plan: 'Starter', used: 312, limit: 500, status: 'Active', mrr: 49, country: 'PH' },
  { id: 't-004', business: 'Lumina Dental', owner: 'Dr. Faye Uy', email: 'faye@luminadental.ph', plan: 'Pro', used: 1990, limit: 2000, status: 'Active', mrr: 149, country: 'PH' },
  { id: 't-005', business: 'Vertex FX', owner: 'Daniel Okafor', email: 'daniel@vertexfx.io', plan: 'Enterprise', used: 8760, limit: 20000, status: 'Active', mrr: 3200, country: 'SG' },
  { id: 't-006', business: 'Glow Studio Cebu', owner: 'Trina Mendoza', email: 'trina@glowstudio.ph', plan: 'Starter', used: 488, limit: 500, status: 'Past Due', mrr: 49, country: 'PH' },
  { id: 't-007', business: 'Halal Bites DXB', owner: 'Yousef Karim', email: 'yousef@halalbites.ae', plan: 'Pro', used: 940, limit: 2000, status: 'Active', mrr: 149, country: 'AE' },
  { id: 't-008', business: 'Casa Verde Realty', owner: 'Paolo Rivera', email: 'paolo@casaverde.ph', plan: 'Pro', used: 1420, limit: 2000, status: 'Trial', mrr: 0, country: 'PH' },
  { id: 't-009', business: 'PureSkin Manila', owner: 'Andrea Lopez', email: 'andrea@pureskin.ph', plan: 'Starter', used: 118, limit: 500, status: 'Paused', mrr: 0, country: 'PH' },
  { id: 't-010', business: 'Atlas Motors', owner: 'Rico Bautista', email: 'rico@atlasmotors.ph', plan: 'Pro', used: 1607, limit: 2000, status: 'Active', mrr: 149, country: 'PH' },
];

export const LIVE_FEED_SEED = [
  { business: 'Marina Heights Realty', customer: '+971 50 ••• 4402', skill: 'Closer Skill', vibe: 'PRO CLOSER' as Vibe },
  { business: 'Nova Aesthetics', customer: '+63 917 ••• 1180', skill: 'Booking Skill', vibe: 'FRIENDLY TITO' as Vibe },
  { business: 'Lumina Dental', customer: '+63 918 ••• 5567', skill: 'FAQ Skill', vibe: 'CALM CARE' as Vibe },
  { business: 'Vertex FX', customer: '+65 8••• 2290', skill: 'Winback Skill', vibe: 'PRO CLOSER' as Vibe },
  { business: 'Halal Bites DXB', customer: '+971 55 ••• 7781', skill: 'Booking Skill', vibe: 'GEN-Z HYPE' as Vibe },
  { business: 'Atlas Motors', customer: '+63 920 ••• 8890', skill: 'Upsell Skill', vibe: 'PRO CLOSER' as Vibe },
  { business: 'Kwentong Kape', customer: '+63 906 ••• 1145', skill: 'Review Skill', vibe: 'FRIENDLY TITO' as Vibe },
  { business: 'Casa Verde Realty', customer: '+63 915 ••• 7712', skill: 'Follow-up Skill', vibe: 'PRO CLOSER' as Vibe },
];

export const CAMPAIGNS = [
  { name: 'December Package Push', audience: 1240, done: 1112, hot: 96, status: 'Running' as const, vibe: 'PRO CLOSER' as Vibe },
  { name: 'No-show Recovery', audience: 380, done: 380, hot: 41, status: 'Completed' as const, vibe: 'CALM CARE' as Vibe },
  { name: 'Abandoned Cart — Week 36', audience: 2100, done: 640, hot: 118, status: 'Running' as const, vibe: 'GEN-Z HYPE' as Vibe },
  { name: 'Dormant Clients 90d', audience: 890, done: 0, hot: 0, status: 'Scheduled' as const, vibe: 'FRIENDLY TITO' as Vibe },
];

export const INTEGRATIONS = [
  { name: 'Twilio', category: 'Telephony', connected: true, detail: 'Outbound calls & SMS' },
  { name: 'Cartesia Sonic', category: 'Voice', connected: true, detail: 'Real human voice synthesis' },
  { name: 'Chatterbox', category: 'Voice', connected: true, detail: 'Conversational turn-taking' },
  { name: 'Deepgram', category: 'Transcription', connected: true, detail: 'Live speech recognition' },
  { name: 'WhatsApp Business', category: 'Messaging', connected: false, detail: 'Follow-up after the call' },
  { name: 'HubSpot', category: 'CRM', connected: false, detail: 'Push hot leads to your pipeline' },
  { name: 'Google Calendar', category: 'Scheduling', connected: true, detail: 'Live availability for bookings' },
  { name: 'Stripe', category: 'Payments', connected: false, detail: 'Payment links from Collection Skill' },
];

/* Platform-wide totals for the RBS Labs super admin */
export const PLATFORM_STATS = {
  mrr: TENANTS.reduce((s, t) => s + t.mrr, 0),
  activeBusinesses: TENANTS.filter((t) => t.status === 'Active' || t.status === 'Trial').length,
  callsToday: 18492,
  hotLeads: 1204,
};
