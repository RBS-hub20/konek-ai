import type { OutboundScript } from '@/lib/types2';

/* ═══════════════════════════════════════════════════════════════════
   The scripts Cindy works from out of the box.

   One `text` per step, not a Philippine and a Gulf column: the country
   already picks the script, so the script is written in one language
   and stays in it. That is what stops Cindy narrating a language
   switch mid-call.

   Numbers are spelled out — "forty nine", "twenty four seven",
   "Konek A I" — because a phone line at 8 kHz mangles digits and
   initialisms.
   ═══════════════════════════════════════════════════════════════════ */

export type SeedScript = Omit<OutboundScript, 'id' | 'created_at'> & { is_builtin: true };

export const BUILTIN_SCRIPTS: SeedScript[] = [
  {
    name: 'Professional Laundry PH (Built-in)',
    industry: 'laundry',
    vibe: 'professional',
    country: 'PH',
    is_default: true,
    is_active: true,
    is_builtin: true,
    voice_settings: {
      speed: 0.88,
      emotion: 'warm-professional',
      pause_ms: 500,
      barge_in: true,
      language_mode: 'PH-direct',
    },
    script_steps: [
      {
        step: 'opener',
        pause_ms: 500,
        text: 'Good morning po. Si Cindy po from Konek A I. Si {{contact}} po ba from {{company}}? May thirty seconds lang po ba kayo?',
        text_ph: '',
        text_ae: '',
      },
      {
        step: 'discovery',
        pause_ms: 500,
        text: 'Marami po sa laundry business tulad ng {{company}} ang naka-miss ng pickup requests pag busy ang staff. Nangyayari po ba yan sa inyo?',
        text_ph: '',
        text_ae: '',
      },
      {
        step: 'pitch',
        pause_ms: 500,
        text: 'Ang Konek A I po ay twenty four seven A I receptionist. Sumasagot po sa Tagalog at English, nagbu-book ng pickup, sumasagot ng magkano per kilo, at naka-log lahat ng tawag. Forty nine dollars per month, may three day free trial. Kami na po magse-setup.',
        text_ph: '',
        text_ae: '',
      },
      {
        step: 'close',
        pause_ms: 400,
        text: 'Puwede ko po kayo i-connect ngayon sa manager namin para sa free trial setup, five minutes lang. Okay lang po ba? One moment po.',
        text_ph: '',
        text_ae: '',
      },
    ],
  },
  {
    name: 'Professional Restaurant PH (Built-in)',
    industry: 'restaurant',
    vibe: 'professional',
    country: 'PH',
    is_default: true,
    is_active: true,
    is_builtin: true,
    voice_settings: {
      speed: 0.88,
      emotion: 'warm-professional',
      pause_ms: 500,
      barge_in: true,
      language_mode: 'PH-direct',
    },
    script_steps: [
      {
        step: 'opener',
        pause_ms: 500,
        text: 'Good morning po. Si Cindy po from Konek A I. Si {{contact}} po ba from {{company}}? May thirty seconds lang po ba?',
        text_ph: '', text_ae: '',
      },
      {
        step: 'discovery',
        pause_ms: 500,
        text: 'Marami pong restaurant ang naka-miss ng reservation calls pag lunch rush. Nangyayari po ba sa {{company}}?',
        text_ph: '', text_ae: '',
      },
      {
        step: 'pitch',
        pause_ms: 500,
        text: 'Ang Konek A I po ay twenty four seven receptionist. Sumasagot ng tawag, kumukuha ng reservation, sumasagot ng menu at presyo, naka-log lahat. Forty nine dollars monthly, three day free trial.',
        text_ph: '', text_ae: '',
      },
      {
        step: 'close',
        pause_ms: 400,
        text: 'I-connect ko na po kayo sa manager para sa free trial. One moment po.',
        text_ph: '', text_ae: '',
      },
    ],
  },
  {
    name: 'Gulf English Professional (Built-in)',
    industry: 'generic',
    vibe: 'professional',
    country: 'AE',
    is_default: true,
    is_active: true,
    is_builtin: true,
    voice_settings: {
      speed: 0.9,
      emotion: 'warm-professional',
      pause_ms: 400,
      barge_in: true,
      language_mode: 'AE-direct',
    },
    script_steps: [
      {
        step: 'opener',
        pause_ms: 400,
        text: 'Good morning, this is Cindy from Konek A I. Am I speaking with {{contact}} from {{company}}? Do you have thirty seconds?',
        text_ph: '', text_ae: '',
      },
      {
        step: 'discovery',
        pause_ms: 400,
        text: 'Many businesses like {{company}} lose three to five bookings weekly from missed calls during busy hours. Is that something you experience?',
        text_ph: '', text_ae: '',
      },
      {
        step: 'pitch',
        pause_ms: 400,
        text: 'Konek A I is a twenty four seven A I receptionist. It answers calls, takes bookings, answers your services and pricing, and logs every call with a transcript. Forty nine dollars per month, with a three day free trial, and we handle the setup.',
        text_ph: '', text_ae: '',
      },
      {
        step: 'close',
        pause_ms: 400,
        text: 'I can connect you now to our business manager to set up your free trial in five minutes. Would that be okay? One moment please.',
        text_ph: '', text_ae: '',
      },
    ],
  },
];
