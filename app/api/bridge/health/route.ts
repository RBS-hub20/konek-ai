import { env, hasMediaBridge, usingDefaultBridge } from '@/lib/env';
import { ok } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/bridge/health
 *
 * Asks the media bridge whether it is alive, from the same network Vercel
 * dials from. One URL to confirm the two halves are actually talking, rather
 * than inferring it from a failed phone call.
 */
export async function GET() {
  const wss = env.mediaStreamUrl;
  /* The bridge serves /health over https on the same host as the websocket. */
  const httpUrl = wss.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:').replace(/\/media-stream$/, '/health');

  const base = {
    configured: hasMediaBridge,
    source: env.mediaStreamSource,
    usingDefault: usingDefaultBridge,
    mediaStreamUrl: wss,
    healthUrl: httpUrl,
  };

  try {
    const res = await fetch(httpUrl, { signal: AbortSignal.timeout(12000), cache: 'no-store' });
    if (!res.ok) {
      return ok({ ...base, reachable: false, status: res.status, error: `Bridge returned ${res.status}` });
    }
    const body = (await res.json()) as Record<string, unknown>;

    /* The bridge needs the shared secret to read /api/call/config; without it
       every call falls back to a generic agent with no business knowledge. */
    const warnings: string[] = [];
    if (body.apiSecretConfigured === false) {
      warnings.push(
        'The bridge has no KONEK_API_SECRET, so it cannot read /api/call/config. Calls will connect but Kai will not know your business, skills or prices. Set KONEK_API_SECRET on Railway to the same value as in Vercel.'
      );
    }
    if (body.openaiConfigured === false) {
      warnings.push('The bridge has no OPENAI_API_KEY, so it cannot hold a conversation.');
    }
    if (typeof body.appUrl === 'string' && !body.appUrl.includes(new URL(env.appUrl).host)) {
      warnings.push(`The bridge points at ${body.appUrl}, not ${env.appUrl}. Check KONEK_APP_URL on Railway.`);
    }

    return ok({ ...base, reachable: true, bridge: body, warnings });
  } catch (err) {
    return ok({
      ...base,
      reachable: false,
      error: err instanceof Error ? err.message : String(err),
      hint: 'Check the Railway service is running and its domain is public.',
    });
  }
}
