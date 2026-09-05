/* Every knob the bridge reads, in one place. */

const read = (name, fallback = '') => {
  const v = process.env[name];
  if (!v) return fallback;
  const t = v.trim();
  return !t || t.startsWith('your_') ? fallback : t;
};

export const config = {
  port: Number(read('PORT', '8080')),

  /* OpenAI Realtime — the same key the Vercel app already uses. */
  openaiKey: read('OPENAI_API_KEY'),
  realtimeModel: read('OPENAI_REALTIME_MODEL', 'gpt-realtime'),
  realtimeUrl: read('OPENAI_REALTIME_URL', 'wss://api.openai.com/v1/realtime'),
  /* 'ga' (default) or 'beta'. Accounts with the beta shape disabled reject the
     old payload with beta_api_shape_disabled. */
  openaiApiShape: read('OPENAI_API_SHAPE', 'ga').toLowerCase(),

  /* Where to fetch the tenant's prompt, and post the transcript back. */
  appUrl: read('KONEK_APP_URL', 'https://konek-ai.vercel.app').replace(/\/$/, ''),
  apiSecret: read('KONEK_API_SECRET'),

  /* Text-to-speech. 'cartesia' routes model text through Sonic; 'openai'
     keeps the realtime speech-to-speech voice. */
  ttsProvider: read('TTS_PROVIDER', 'openai').toLowerCase(),
  cartesiaKey: read('CARTESIA_API_KEY'),
  cartesiaModel: read('CARTESIA_MODEL', 'sonic-2'),
  cartesiaVoiceName: read('CARTESIA_VOICE_NAME', 'Skylar'),
  cartesiaVoiceId: read('CARTESIA_VOICE_ID'),
  cartesiaVersion: read('CARTESIA_VERSION', '2024-06-10'),
  cartesiaWsUrl: read('CARTESIA_WS_URL', 'wss://api.cartesia.ai/tts/websocket'),
  /* Confirmed working on this account in all five languages via /tts-check.
     They must go in separate fields — speed at the top level, emotion under
     the voice's experimental controls. Sending speed in both places makes
     Sonic return silence rather than an error. */
  cartesiaSpeed: read('CARTESIA_SPEED', '0.95'),
  cartesiaEmotion: read('CARTESIA_EMOTION', 'positivity:high')
    .split(',').map((x) => x.trim()).filter(Boolean),
  /* Per-language voices — Sonic needs a voice that actually speaks the
     language, so these are chosen alongside the language code. */
  voiceTl: read('CARTESIA_VOICE_TL', 'Angel'),
  voiceAr: read('CARTESIA_VOICE_AR', 'Rania'),
  voiceHi: read('CARTESIA_VOICE_HI', 'Ishani'),
  /* Tagalog voices exist, so Taglish uses one by default. Set to 'en' to read
     Taglish with an English voice instead. */
  langTl: read('CARTESIA_LANG_TL', 'tl'),
  langTaglish: read('CARTESIA_LANG_TAGLISH', 'tl'),
  /* sonic-2 rejects tl and ar, so those default to the newer model. Override
     any of them if your account has different model access. */
  modelByLanguage: {
    en: read('CARTESIA_MODEL_EN', read('CARTESIA_MODEL', 'sonic-2')),
    tl: read('CARTESIA_MODEL_TL', 'sonic-3'),
    ar: read('CARTESIA_MODEL_AR', 'sonic-3'),
    hi: read('CARTESIA_MODEL_HI', 'sonic-3'),
  },

  /* Turn detection. Phone lines carry traffic, TV and other voices, so the
     threshold sits above a conversational default and the silence window is
     long enough that a thinking pause is not treated as the end of a turn. */
  vadThreshold: Number(read('VAD_THRESHOLD', '0.65')),
  vadSilenceMs: Number(read('VAD_SILENCE_MS', '800')),
  vadPrefixMs: Number(read('VAD_PREFIX_MS', '300')),
  /* 'near_field' suits a handset held to the ear; 'far_field' a speakerphone.
     Empty disables it. */
  noiseReduction: read('NOISE_REDUCTION', 'near_field'),

  /* Hard stop so a stuck call can never bill forever. */
  maxCallSeconds: Number(read('MAX_CALL_SECONDS', '600')),

  logLevel: read('LOG_LEVEL', 'info'),
};

/** OpenAI realtime voices, chosen to suit each vibe. */
export const VIBE_VOICES = {
  'PRO CLOSER': 'ash',
  'FRIENDLY TITO': 'verse',
  'GEN-Z HYPE': 'ballad',
  'CALM CARE': 'shimmer',
};

export const voiceForVibe = (style) => VIBE_VOICES[style] ?? 'alloy';

/** True when Sonic should synthesize instead of OpenAI's own voice. */
export const useCartesia = () =>
  config.ttsProvider === 'cartesia' && Boolean(config.cartesiaKey);

export function assertConfig() {
  const missing = [];
  if (!config.openaiKey) missing.push('OPENAI_API_KEY');
  if (config.ttsProvider === 'cartesia' && !config.cartesiaKey) {
    /* Not fatal: fall back to the OpenAI voice rather than refusing to boot. */
    console.warn(
      '[KONEK AI] TTS_PROVIDER=cartesia but CARTESIA_API_KEY is missing — falling back to the OpenAI voice.'
    );
  }
  if (missing.length) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}. ` +
        'Set them in the Railway service before starting the bridge.'
    );
  }
}
