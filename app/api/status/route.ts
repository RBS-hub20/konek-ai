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
import { ok, describeError } from '@/lib/server/http';
import { listBusinesses } from '@/lib/server/tenant';

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

    /* Per-tenant readiness: a business with no outbound number cannot dial. */
    let dbError: string | null = null;
    let businesses: {
      id: string; name: string; outbound_number: string | null; plan: string;
      calls_used: number; calls_limit: number; status: string; canCall: boolean;
    }[] = [];
    try {
      businesses = (await listBusinesses()).map((b) => ({
        id: b.id, name: b.name, outbound_number: b.outbound_number, plan: b.plan,
        calls_used: b.calls_used, calls_limit: b.calls_limit, status: b.status,
        canCall:
          b.status === 'active' &&
          b.calls_used < b.calls_limit &&
          Boolean(b.outbound_number || env.twilioNumber),
      }));
    } catch (err) {
      /* Status must answer even if the database is unreachable — but say why. */
      dbError = describeError(err).detail;
      warnings.push(
        `Could not read the businesses table: ${dbError}. Run supabase-v2.sql in the Supabase SQL Editor.`
      );
    }

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
      businesses,
      dbError,
      warnings: hasSupabase && !dbError && businesses.length === 0
        ? [...warnings, 'The businesses table is empty. Run supabase-v2.sql — it bootstraps the first tenant.']
        : warnings,
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
        warnings: ['Status check failed: ' + (describeError(err).detail)],
      },
      { status: 200 }
    );
  }
}
