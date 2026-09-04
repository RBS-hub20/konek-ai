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

export function assertConfig() {
  const missing = [];
  if (!config.openaiKey) missing.push('OPENAI_API_KEY');
  if (missing.length) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}. ` +
        'Set them in the Railway service before starting the bridge.'
    );
  }
}
