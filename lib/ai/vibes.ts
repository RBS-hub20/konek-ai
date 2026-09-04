import type { VibeKey } from '@/lib/types2';

/* One place defining how each vibe sounds, for both the prompt and TTS. */
export const VIBE_CONFIG: Record<VibeKey, {
  label: string;
  tagline: string;
  style: string;
  /* Cartesia Sonic voice id — replace with your own cloned voices. */
  voiceId: string;
  /* Twilio <Say> fallback voice, used when Cartesia is not configured. */
  twilioVoice: string;
  sample: string;
}> = {
  PRO_CLOSER: {
    label: 'PRO CLOSER',
    tagline: 'Direct. Confident. Closes.',
    style: 'Direct, confident, executive. No filler words. Handle objections head-on and always drive to a decision before the call ends. Keep sentences short.',
    voiceId: 'a0e99841-438c-4a64-b679-ae501e7d6091',
    twilioVoice: 'Polly.Matthew-Neural',
    sample: "Hi Marco, this is Kai from Nova Aesthetics. I'll be quick — you asked about the December package. I have two slots left this week and I can hold one under your name right now. Which works better, Thursday 2pm or Friday 11am?",
  },
  FRIENDLY_TITO: {
    label: 'FRIENDLY TITO',
    tagline: 'Warm. Familiar. Trusted.',
    style: 'Warm, familiar, trusted — like a friendly Filipino uncle. Natural Taglish is welcome. Build rapport before asking for anything. Never pushy.',
    voiceId: '79a125e8-cd45-4c13-8a67-188112f4dd22',
    twilioVoice: 'Polly.Joey-Neural',
    sample: "Hello po, si Kai ito from Nova Aesthetics! Kumusta po kayo? Nakita ko lang po na nag-inquire kayo about sa package namin. Wala pong pressure ha — gusto ko lang malaman kung may tanong pa kayo.",
  },
  GEN_Z_HYPE: {
    label: 'GEN-Z HYPE',
    tagline: 'Fast. Fun. High energy.',
    style: 'Fast, playful, high energy. Short punchy sentences. Enthusiastic but never cringe or pushy.',
    voiceId: '2ee87190-8f84-4925-97da-e52547f9462c',
    twilioVoice: 'Polly.Salli-Neural',
    sample: "Heyy it's Kai from Nova — okay so the thing you were eyeing? It's back in stock and honestly it's moving fast. I can lock one for you right now, takes like ten seconds.",
  },
  CALM_CARE: {
    label: 'CALM CARE',
    tagline: 'Gentle. Patient. Reassuring.',
    style: 'Gentle, patient, reassuring. Slower pace. Never rush the customer and always give them room to think.',
    voiceId: '156fb8d2-b182-4ab2-9c48-cf5c5c69b0ba',
    twilioVoice: 'Polly.Joanna-Neural',
    sample: "Hi Elena, this is Kai calling from Nova Clinic. I hope I'm not catching you at a bad time. I just wanted to check in about your appointment on Tuesday, and answer anything you might be unsure about.",
  },
};

export const vibeConfig = (v: string) =>
  VIBE_CONFIG[(v?.toUpperCase().replace(/[\s-]+/g, '_') as VibeKey)] ?? VIBE_CONFIG.PRO_CLOSER;
