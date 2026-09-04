import { getBusiness, listIntegrations, getBusinessForRead, safe, setIntegration } from '@/lib/server/tenant';
import { env, hasCartesia, hasDeepgram, hasStripe, hasTwilio } from '@/lib/env';
import { fail, handle, ok, readJson, describeError } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/* Providers whose connection is decided by server env, not by a DB row. */
const ENV_BACKED: Record<string, () => { connected: boolean; detail: string }> = {
  Twilio: () => ({ connected: hasTwilio, detail: 'Outbound calls & SMS' }),
  'Cartesia Sonic': () => ({ connected: hasCartesia, detail: 'Real human voice synthesis' }),
  Deepgram: () => ({ connected: hasDeepgram, detail: 'Live speech recognition' }),
  Stripe: () => ({ connected: hasStripe, detail: 'Payment links & billing' }),
};

const CATALOGUE = [
  { name: 'Twilio', category: 'Telephony', detail: 'Outbound calls & SMS' },
  { name: 'Cartesia Sonic', category: 'Voice', detail: 'Real human voice synthesis' },
  { name: 'Chatterbox', category: 'Voice', detail: 'Conversational turn-taking' },
  { name: 'Deepgram', category: 'Transcription', detail: 'Live speech recognition' },
  { name: 'WhatsApp Business', category: 'Messaging', detail: 'Follow-up after the call' },
  { name: 'HubSpot', category: 'CRM', detail: 'Push hot leads to your pipeline' },
  { name: 'Google Calendar', category: 'Scheduling', detail: 'Live availability for bookings' },
  { name: 'Stripe', category: 'Payments', detail: 'Payment links from Collection Skill' },
];

/** GET /api/integrations?businessId= */
export async function GET(req: Request) {
  const businessId = new URL(req.url).searchParams.get('businessId');
  return handle(async () => {
    const { business } = await getBusinessForRead(businessId);
    const saved = await safe(() => listIntegrations(business.id), []);
    const byProvider = new Map(saved.map((s) => [s.provider, s]));

    const integrations = CATALOGUE.map((c) => {
      const envBacked = ENV_BACKED[c.name];
      const row = byProvider.get(c.name);
      const connected = envBacked ? envBacked().connected : Boolean(row?.is_connected);
      return {
        name: c.name,
        category: c.category,
        detail: c.detail,
        connected,
        managedByEnv: Boolean(envBacked),
        /* Twilio shows the tenant's own outbound number. */
        meta: c.name === 'Twilio'
          ? { number: business.outbound_number || env.twilioNumber || null }
          : {},
      };
    });

    return { integrations, businessId: business.id, businessName: business.name };
  });
}

/** POST /api/integrations — { provider, connected, apiKey? } */
export async function POST(req: Request) {
  const body = await readJson<{ businessId?: string; provider?: string; connected?: boolean; apiKey?: string }>(req);
  if (!body?.provider) return fail('provider is required');
  if (typeof body.connected !== 'boolean') return fail('connected must be true or false');

  if (ENV_BACKED[body.provider]) {
    return fail(
      `${body.provider} is configured with server environment variables, not from this screen. Set its keys in Vercel and redeploy.`,
      409
    );
  }

  try {
    const business = await getBusiness(body.businessId);
    if (!business) return fail('No business found', 404);
    const row = await setIntegration(business.id, body.provider, body.connected, body.apiKey);
    return ok({ integration: row });
  } catch (err) {
    return fail('Could not update integration', 500, describeError(err).detail);
  }
}
