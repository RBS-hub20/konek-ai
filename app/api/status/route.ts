import {
  configWarnings,
  env,
  hasCartesia,
  hasDeepgram,
  hasOpenAI,
  hasStripe,
  hasSupabase,
  hasSupabaseAdmin,
  hasTwilio,
  isVercel,
  serviceStatus,
} from '@/lib/env';
import { ok } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const flag = (on: boolean) => (on ? 'live' : 'missing');

/**
 * GET /api/status — deployment health.
 *
 * Deliberately depends on nothing but process.env, so it answers even when the
 * whole environment is empty. This is the first thing to hit after a deploy.
 */
export async function GET() {
  try {
    const services = serviceStatus();
    const warnings = configWarnings();

    return ok({
      mode: hasSupabase ? 'live' : 'mock',
      supabase: hasSupabase ? 'connected' : 'missing',
      twilio: flag(hasTwilio),
      cartesia: flag(hasCartesia),
      deepgram: flag(hasDeepgram),
      stripe: flag(hasStripe),
      openai: flag(hasOpenAI),
      env: {
        hasSupabaseUrl: Boolean(env.supabaseUrl),
        hasAnon: Boolean(env.supabaseAnonKey),
        hasServiceRole: Boolean(env.supabaseServiceKey),
        hasTwilioSid: Boolean(env.twilioSid),
        hasTwilioToken: Boolean(env.twilioToken),
        hasTwilioNumber: Boolean(env.twilioNumber),
        hasCartesiaKey: Boolean(env.cartesiaKey),
        hasDeepgramKey: Boolean(env.deepgramKey),
        hasStripeSecret: Boolean(env.stripeSecret),
        hasOpenAIKey: Boolean(env.openaiKey),
        hasApiSecret: Boolean(env.apiSecret),
        hasAppUrl: Boolean(env.appUrl),
      },
      /* True when live calls are actually permitted right now. */
      liveCallsEnabled: hasTwilio && Boolean(env.apiSecret),
      appUrl: env.appUrl,
      deployment: {
        vercel: isVercel,
        region: process.env.VERCEL_REGION ?? null,
        commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      },
      services,
      warnings,
      note: hasSupabase
        ? 'Connected to Supabase.'
        : 'No Supabase credentials — running on in-memory data. See README_VERCEL.md.',
      /* Surfaced so an operator can see the admin write path is degraded. */
      writesPersist: hasSupabaseAdmin,
    });
  } catch (err) {
    /* Status must never 500 — a broken status endpoint hides the real problem. */
    return ok(
      {
        mode: 'mock',
        supabase: 'missing',
        twilio: 'missing',
        cartesia: 'missing',
        deepgram: 'missing',
        stripe: 'missing',
        openai: 'missing',
        env: {},
        warnings: ['Status check failed: ' + (err instanceof Error ? err.message : String(err))],
      },
      { status: 200 }
    );
  }
}
