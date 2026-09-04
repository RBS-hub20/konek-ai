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
  /* Only sent when set — an unsupported control should not break synthesis. */
  cartesiaSpeed: read('CARTESIA_SPEED', ''),

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
