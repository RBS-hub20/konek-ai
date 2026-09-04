/* Central place that decides whether each service is really configured.
   Every value in .env.local starts as a `your_*` placeholder, so a
   placeholder counts as "not configured" and the app stays in mock mode. */

function read(name: string): string {
  const v = process.env[name];
  if (!v) return '';
  const t = v.trim();
  if (!t || t.startsWith('your_') || t === 'undefined' || t === 'null') return '';
  return t;
}

/* The deployed Railway bridge. Used when nothing is configured, so a fresh
   deploy has working two-way calls without a dashboard step. Override it with
   MEDIA_STREAM_URL when the bridge moves. */
const DEFAULT_BRIDGE = 'https://konek-ai-production.up.railway.app';

/**
 * Accepts any of MEDIA_STREAM_URL, NEXT_PUBLIC_BRIDGE_URL or BRIDGE_URL, in
 * that order, and normalises whatever form it is given:
 *   https://host            -> wss://host/media-stream
 *   wss://host              -> wss://host/media-stream
 *   wss://host/media-stream -> unchanged
 */
function resolveMediaStreamUrl(): { url: string; source: string } {
  const candidates: [string, string][] = [
    ['MEDIA_STREAM_URL', read('MEDIA_STREAM_URL')],
    ['NEXT_PUBLIC_BRIDGE_URL', read('NEXT_PUBLIC_BRIDGE_URL')],
    ['BRIDGE_URL', read('BRIDGE_URL')],
  ];
  for (const [source, value] of candidates) {
    if (value) return { url: normalizeBridgeUrl(value), source };
  }
  return { url: normalizeBridgeUrl(DEFAULT_BRIDGE), source: 'built-in default' };
}

export function normalizeBridgeUrl(raw: string): string {
  let v = raw.trim().replace(/\/+$/, '');
  v = v.replace(/^https:\/\//i, 'wss://').replace(/^http:\/\//i, 'ws://');
  if (!/^wss?:\/\//i.test(v)) v = `wss://${v}`;
  /* Add the path only when one was not supplied. */
  const withoutScheme = v.replace(/^wss?:\/\//i, '');
  if (!withoutScheme.includes('/')) v = `${v}/media-stream`;
  return v;
}

/* Resolved once at module load. */
const MEDIA = resolveMediaStreamUrl();

export const env = {
  supabaseUrl: read('NEXT_PUBLIC_SUPABASE_URL'),
  supabaseAnonKey: read('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  supabaseServiceKey: read('SUPABASE_SERVICE_ROLE_KEY'),

  twilioSid: read('TWILIO_ACCOUNT_SID'),
  twilioToken: read('TWILIO_AUTH_TOKEN'),
  twilioNumber: read('TWILIO_PHONE_NUMBER'),

  cartesiaKey: read('CARTESIA_API_KEY'),
  deepgramKey: read('DEEPGRAM_API_KEY'),

  stripeSecret: read('STRIPE_SECRET_KEY'),
  stripePublishable: read('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY'),

  openaiKey: read('OPENAI_API_KEY'),

  apiSecret: read('KONEK_API_SECRET'),
  /* Websocket the media bridge listens on. Twilio connects to it — the
     browser never does — so this is read server-side only. */
  mediaStreamUrl: MEDIA.url,
  mediaStreamSource: MEDIA.source,
  appUrl: resolveAppUrl(),
};

/* On Vercel, VERCEL_URL is injected for every deployment (including previews),
   so webhooks and Stripe redirects keep working even if NEXT_PUBLIC_APP_URL
   was never set. Explicit config always wins. */
function resolveAppUrl(): string {
  const explicit = read('NEXT_PUBLIC_APP_URL');
  if (explicit) return explicit.replace(/\/$/, '');
  const vercel = read('VERCEL_URL');
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, '')}`;
  return 'http://localhost:3000';
}

export const isVercel = Boolean(process.env.VERCEL);
export const hasExplicitAppUrl = Boolean(read('NEXT_PUBLIC_APP_URL'));

/* A Supabase URL must actually parse, or createClient throws at import time. */
function isUrl(u: string) {
  try {
    new URL(u);
    return true;
  } catch {
    return false;
  }
}

export const hasSupabase = Boolean(env.supabaseUrl && env.supabaseAnonKey && isUrl(env.supabaseUrl));
export const hasSupabaseAdmin = Boolean(hasSupabase && env.supabaseServiceKey);
export const hasTwilio = Boolean(env.twilioSid && env.twilioToken && env.twilioNumber);
export const hasCartesia = Boolean(env.cartesiaKey);
export const hasDeepgram = Boolean(env.deepgramKey);
export const hasStripe = Boolean(env.stripeSecret);
export const hasOpenAI = Boolean(env.openaiKey);
export const hasMediaBridge = Boolean(env.mediaStreamUrl);
export const usingDefaultBridge = env.mediaStreamSource === 'built-in default';

/** What the API reports back so the UI can show what is live. */
export function serviceStatus() {
  return {
    supabase: hasSupabase,
    twilio: hasTwilio,
    cartesia: hasCartesia,
    deepgram: hasDeepgram,
    stripe: hasStripe,
    openai: hasOpenAI,
    mediaBridge: hasMediaBridge,
  };
}

/** Deployment problems worth surfacing rather than failing silently. */
export function configWarnings(): string[] {
  const w: string[] = [];
  if (!hasSupabase) {
    w.push(
      'No Supabase credentials — running on in-memory data. On Vercel each serverless invocation may get a fresh instance, so writes will not persist. Add the Supabase env vars.'
    );
  }
  if (hasSupabase && !env.supabaseServiceKey) {
    w.push('SUPABASE_SERVICE_ROLE_KEY is missing — writes fall back to the anon key and will fail once RLS is enabled.');
  }
  if (hasTwilio && !env.apiSecret) {
    w.push('Twilio is configured but KONEK_API_SECRET is not set — /api/call refuses live calls until it is.');
  }
  if (isVercel && !hasExplicitAppUrl) {
    w.push(
      `NEXT_PUBLIC_APP_URL is not set — falling back to ${env.appUrl}. Set it to your production domain so Twilio callbacks and Stripe redirects are stable across deployments.`
    );
  }
  if (usingDefaultBridge) {
    w.push(
      `No bridge URL configured — falling back to the built-in default ${env.mediaStreamUrl}. Set MEDIA_STREAM_URL in Vercel to pin it.`
    );
  }
  if (hasMediaBridge && !/^wss:\/\//.test(env.mediaStreamUrl)) {
    w.push(`The bridge URL must resolve to wss:// — got "${env.mediaStreamUrl}".`);
  }
  if (hasTwilio && env.appUrl.includes('localhost')) {
    w.push('NEXT_PUBLIC_APP_URL points at localhost — Twilio cannot reach it. Use a public URL (ngrok locally).');
  }
  return w;
}
