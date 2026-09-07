import { getBusinessForRead, getSalesTenant, listBusinesses, logCall, safe } from '@/lib/server/tenant';
import { env, hasMediaBridge } from '@/lib/env';
import { SALES_CALLBACK_OPENER } from '@/lib/voice/salesCallback';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/call/inbound — somebody rang one of our numbers.
 *
 * Twilio posts here as the number's voice webhook, so the answer must be
 * TwiML and it must always be TwiML: an error page is dead air on a live
 * call. Every failure below falls through to a spoken apology.
 *
 * Which number they rang decides who answers. Ring the sales line and you
 * get the closer, because the only people who ring it are prospects Cindy
 * called and who missed it.
 */
export async function POST(req: Request) {
  let to = '';
  let from = '';
  let callSid = '';
  try {
    const form = await req.formData();
    to = (form.get('To') as string) ?? '';
    from = (form.get('From') as string) ?? '';
    callSid = (form.get('CallSid') as string) ?? '';
  } catch {
    /* Twilio always posts a form; if it did not, the fallback still answers. */
  }

  const digits = (n: string) => n.replace(/\D/g, '');
  const sales = await safe(() => getSalesTenant(), null);
  const all = await safe(() => listBusinesses(), []);
  const owner = to
    ? all.find((b) => b.outbound_number && digits(b.outbound_number) === digits(to)) ?? null
    : null;

  /* The sales line is answered by the closer; any other number is answered
     by the tenant that owns it. */
  const isSalesLine = Boolean(
    sales?.outbound_number && to && digits(sales.outbound_number) === digits(to)
  );
  const business = isSalesLine ? sales : owner ?? (await safe(async () => (await getBusinessForRead(null)).business, null));

  console.log(
    `[Inbound] ${from} → ${to} (${callSid}): ` +
    (isSalesLine ? 'KONEK AI sales line, closer script' : `${business?.name ?? 'no tenant'}, receptionist`)
  );

  await safe(() => logCall({
    business_id: business?.id ?? null,
    phone: from || 'unknown',
    from_number: to || null,
    customer_name: null,
    vibe: isSalesLine ? 'PRO_CLOSER' : business?.active_vibe ?? null,
    language: business?.language ?? 'EN',
    status: 'Inbound',
    twilio_sid: callSid || null,
  }), { id: null, dropped: [], error: null });

  return twiml(
    hasMediaBridge
      ? stream({
          businessId: business?.id ?? '',
          vibe: isSalesLine ? 'PRO_CLOSER' : business?.active_vibe ?? 'FRIENDLY',
          language: business?.language ?? 'EN',
          inbound: isSalesLine ? 'sales-callback' : 'reception',
        })
      : say(isSalesLine ? SALES_CALLBACK_OPENER : 'Thanks for calling. Nobody is available right now — please try again shortly.')
  );
}

/** Twilio probes the webhook before it saves it. */
export async function GET() {
  return twiml(say('This is the KONEK AI voice webhook.'));
}

/* ── TwiML ───────────────────────────────────────────────────────── */

function stream(params: Record<string, string>): string {
  const attrs = Object.entries(params)
    .filter(([, v]) => v)
    .map(([k, v]) => `<Parameter name="${k}" value="${escapeXml(v)}"/>`)
    .join('');
  return `<Connect><Stream url="${escapeXml(env.mediaStreamUrl)}">${attrs}</Stream></Connect>`;
}

const say = (text: string) =>
  `<Say voice="Polly.Joanna-Neural">${escapeXml(text)}</Say>`;

function twiml(body: string): Response {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, {
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
  });
}

function escapeXml(s: string) {
  return String(s).replace(/[<>&"']/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c] ?? c
  );
}
