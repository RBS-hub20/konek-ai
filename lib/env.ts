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

/** What the API reports back so the UI can show what is live. */
export function serviceStatus() {
  return {
    supabase: hasSupabase,
    twilio: hasTwilio,
    cartesia: hasCartesia,
    deepgram: hasDeepgram,
    stripe: hasStripe,
    openai: hasOpenAI,
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
  if (hasTwilio && env.appUrl.includes('localhost')) {
    w.push('NEXT_PUBLIC_APP_URL points at localhost — Twilio cannot reach it. Use a public URL (ngrok locally).');
  }
  return w;
}
