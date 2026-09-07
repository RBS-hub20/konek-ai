import { getCallLog, getLead, findCallByTwilioSid, safe } from '@/lib/server/tenant';
import { fail, ok, describeError } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/leads/:id/call — the last call placed to this lead.
 *
 * The call list knows a lead, not a call, so playing "the last call to
 * Natsu Cafe" needs the hop. last_call_id is set when the dialer places a
 * call; twilio_sid is the fallback for leads called before that column
 * existed, which is most of the ones already in the pipeline.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const id = params.id?.trim();
  if (!id) return fail('A lead id is required.');

  try {
    const lead = await getLead(id);
    if (!lead) return fail('Lead not found', 404);

    const call =
      (lead.last_call_id ? await safe(() => getCallLog(lead.last_call_id!), null) : null)
      ?? (lead.twilio_sid ? await safe(() => findCallByTwilioSid(lead.twilio_sid!), null) : null);

    if (!call) {
      return ok({
        call: null,
        reason: lead.call_count
          ? 'This lead has been called, but no call record was kept for it.'
          : 'This lead has not been called yet.',
      });
    }
    return ok({ call });
  } catch (err) {
    return fail('Could not read that call', 500, describeError(err).detail);
  }
}
