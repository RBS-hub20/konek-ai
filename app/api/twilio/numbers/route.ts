import { getBusiness, listBusinesses, updateBusiness } from '@/lib/server/tenant';
import { env, hasTwilio } from '@/lib/env';
import { guardCall, toE164 } from '@/lib/server/operator';
import { fail, ok, readJson, describeError } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/twilio/numbers
 *
 * The number pool: every number on the Twilio account, with the tenant it is
 * assigned to. `?verify=+123...` also answers whether that number really
 * belongs to the account, which is what Settings uses for its verified badge.
 */
export async function GET(req: Request) {
  const verify = new URL(req.url).searchParams.get('verify');

  if (!hasTwilio) {
    return ok({
      live: false,
      numbers: [],
      ...(verify ? { verify: { number: verify, verified: false, reason: 'Twilio is not configured on the server.' } } : {}),
      note: 'Twilio is not configured — no pool to read.',
    });
  }

  try {
    const { default: Twilio } = await import('twilio');
    const client = Twilio(env.twilioSid, env.twilioToken);
    const owned = await client.incomingPhoneNumbers.list({ limit: 100 });
    const businesses = await listBusinesses();
    const assigned = new Map(
      businesses.filter((b) => b.outbound_number).map((b) => [normalize(b.outbound_number!), b])
    );

    const numbers = owned.map((n) => {
      const biz = assigned.get(normalize(n.phoneNumber));
      return {
        phoneNumber: n.phoneNumber,
        friendlyName: n.friendlyName,
        sid: n.sid,
        capabilities: n.capabilities,
        assignedTo: biz ? { id: biz.id, name: biz.name } : null,
      };
    });

    const result: Record<string, unknown> = { live: true, numbers, count: numbers.length };

    if (verify) {
      const match = numbers.find((n) => normalize(n.phoneNumber) === normalize(verify));
      result.verify = match
        ? { number: verify, verified: true, sid: match.sid, capabilities: match.capabilities }
        : { number: verify, verified: false, reason: 'This number is not on the connected Twilio account.' };
    }

    return ok(result);
  } catch (err) {
    return fail('Could not read Twilio numbers', 502, describeError(err).detail);
  }
}

/**
 * POST /api/twilio/numbers — buy a number and optionally assign it.
 *   { areaCode?, country?, businessId?, search?: true }
 *
 * This spends money, so it is behind the same gate as placing a call.
 * `search: true` only lists what is available and buys nothing.
 */
export async function POST(req: Request) {
  const guard = guardCall(req);
  if (!guard.ok) {
    return Response.json(
      { error: guard.message, ...(guard.needsUnlock ? { needsUnlock: true } : {}) },
      { status: guard.status }
    );
  }
  if (!hasTwilio) return fail('Twilio is not configured on the server.', 503);

  const body = await readJson<{ areaCode?: string; country?: string; businessId?: string; search?: boolean }>(req);
  const country = (body?.country ?? 'US').toUpperCase();

  try {
    const { default: Twilio } = await import('twilio');
    const client = Twilio(env.twilioSid, env.twilioToken);

    const available = await client
      .availablePhoneNumbers(country)
      .local.list({
        limit: 10,
        ...(body?.areaCode ? { areaCode: Number(body.areaCode) } : {}),
        voiceEnabled: true,
      });

    if (!available.length) {
      return fail(`No numbers available in ${country}${body?.areaCode ? ` area code ${body.areaCode}` : ''}.`, 404);
    }

    /* Search only — show the operator what they would be buying. */
    if (body?.search) {
      return ok({
        bought: false,
        available: available.map((a) => ({ phoneNumber: a.phoneNumber, locality: a.locality, region: a.region })),
      });
    }

    const purchased = await client.incomingPhoneNumbers.create({
      phoneNumber: available[0].phoneNumber,
      friendlyName: 'KONEK AI',
    });

    let assignedTo: string | null = null;
    if (body?.businessId) {
      const business = await getBusiness(body.businessId);
      if (business) {
        await updateBusiness(business.id, { outbound_number: purchased.phoneNumber });
        assignedTo = business.name;
      }
    }

    return ok({ bought: true, phoneNumber: purchased.phoneNumber, sid: purchased.sid, assignedTo }, { status: 201 });
  } catch (err) {
    return fail('Could not buy a number', 502, describeError(err).detail);
  }
}

const normalize = (n: string) => n.replace(/[^0-9]/g, '');
void toE164;
