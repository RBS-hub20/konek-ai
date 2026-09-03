import {
  activeSkillPrompts,
  brainForPrompt,
  createCall,
  getBusiness,
  incrementCallsUsed,
  listCalls,
  listCustomSkills,
} from '@/lib/server/repo';
import { DEMO_BUSINESS_ID } from '@/lib/server/seed';
import { buildSystemPrompt, DEFAULT_VIBE } from '@/lib/ai/prompt';
import { env, hasTwilio, hasCartesia, hasDeepgram } from '@/lib/env';
import { guardCallApi, isValidPhone } from '@/lib/server/auth';
import { fail, handle, ok, readJson } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface CallBody {
  businessId?: string;
  customerPhone?: string;
  customerName?: string;
  vibe?: string;
  skills?: string[];
  /** Return the assembled prompt without dialling anyone. */
  dryRun?: boolean;
}

/** GET /api/call?businessId=&limit= — the call log. */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const businessId = p.get('businessId') ?? DEMO_BUSINESS_ID;
  const limit = Math.min(Number(p.get('limit') ?? 50) || 50, 200);
  return handle(async () => ({ calls: await listCalls(businessId, limit), businessId }));
}

/**
 * POST /api/call — place a call.
 *
 *  1. Load the business, its Business Brain and its active skills
 *  2. Assemble one system prompt: vibe + goal + skills + custom skills + brain
 *  3. Dial via Twilio, streaming audio to the voice websocket
 *  4. Record the call in the calls table
 *
 * With no Twilio credentials it stops after step 2 and records the call as
 * `initiated`, so the whole pipeline is exercisable without spending money.
 */
export async function POST(req: Request) {
  const guard = guardCallApi(req);
  if (!guard.ok) return fail(guard.message, guard.status);

  const body = await readJson<CallBody>(req);
  if (!body) return fail('Invalid JSON body');

  const businessId = body.businessId ?? DEMO_BUSINESS_ID;
  const customerPhone = (body.customerPhone ?? '').trim();

  if (!customerPhone) return fail('customerPhone is required');
  if (!isValidPhone(customerPhone)) return fail('customerPhone is not a valid phone number');

  try {
    /* ── 1. Context ───────────────────────────────────────────────── */
    const business = await getBusiness(businessId);
    if (!business) return fail('Business not found', 404);

    if (business.calls_used >= business.calls_limit) {
      return fail(
        `Call limit reached (${business.calls_used}/${business.calls_limit}). Upgrade the plan to continue.`,
        402
      );
    }

    const vibe = body.vibe ?? business.vibe ?? DEFAULT_VIBE;
    const [skills, customSkills, brain] = await Promise.all([
      activeSkillPrompts(businessId, body.skills),
      listCustomSkills(businessId),
      brainForPrompt(businessId),
    ]);

    /* ── 2. The prompt the agent runs on ──────────────────────────── */
    const systemPrompt = buildSystemPrompt({ business, vibe, skills, customSkills, brain });

    if (body.dryRun) {
      return ok({
        dryRun: true,
        vibe,
        skillsUsed: skills.map((s) => s.id),
        promptChars: systemPrompt.length,
        systemPrompt,
      });
    }

    /* ── 3. Dial ──────────────────────────────────────────────────── */
    let twilioSid: string | null = null;
    let status = 'initiated';
    let mock = true;
    let warning: string | undefined;

    if (hasTwilio) {
      try {
        const { default: Twilio } = await import('twilio');
        const client = Twilio(env.twilioSid, env.twilioToken);
        const streamUrl = `${env.appUrl.replace(/^http/, 'ws')}/api/call/stream`;

        const call = await client.calls.create({
          to: customerPhone,
          from: env.twilioNumber,
          twiml: `<Response><Connect><Stream url="${streamUrl}"><Parameter name="businessId" value="${businessId}"/><Parameter name="vibe" value="${escapeXml(vibe)}"/></Stream></Connect></Response>`,
          statusCallback: `${env.appUrl}/api/call/transcript`,
          statusCallbackEvent: ['initiated', 'answered', 'completed'],
        });

        twilioSid = call.sid;
        status = 'connected';
        mock = false;
      } catch (err) {
        /* Record the attempt rather than losing it. */
        status = 'failed';
        warning = err instanceof Error ? err.message : String(err);
      }
    } else {
      warning = 'No Twilio credentials — call recorded but not dialled.';
    }

    /* ── 4. Persist ───────────────────────────────────────────────── */
    const call = await createCall({
      business_id: businessId,
      customer_name: body.customerName ?? null,
      customer_phone: customerPhone,
      skills_used: skills.map((s) => s.id),
      vibe,
      status,
      twilio_sid: twilioSid,
    });

    if (status !== 'failed') await incrementCallsUsed(businessId);

    return ok(
      {
        success: status !== 'failed',
        callId: call.id,
        twilioSid,
        status,
        mock,
        vibe,
        skillsUsed: skills.map((s) => s.id),
        promptChars: systemPrompt.length,
        services: { twilio: hasTwilio, cartesia: hasCartesia, deepgram: hasDeepgram },
        ...(warning ? { warning } : {}),
      },
      { status: status === 'failed' ? 502 : 201 }
    );
  } catch (err) {
    return fail('Could not place call', 500, err instanceof Error ? err.message : String(err));
  }
}

function escapeXml(s: string) {
  return s.replace(/[<>&"']/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c] ?? c
  );
}
