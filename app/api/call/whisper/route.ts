import { ok } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * TwiML played to the SALES MANAGER only, before the caller is bridged in.
 *
 * Twilio fetches this from the <Number url="..."> attribute, so the customer
 * never hears it — the manager picks up already knowing who is on the line and
 * why, which is the whole point of a warm transfer.
 */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const company = p.get('company')?.trim();
  const country = p.get('country')?.trim();
  const industry = p.get('industry')?.trim();
  const contact = p.get('contact')?.trim();

  const parts = ['KONEK A I transfer.'];
  if (company) parts.push(`${company}.`);
  if (contact) parts.push(`Speaking to ${contact}.`);
  if (industry) parts.push(`${industry}.`);
  if (country) parts.push(`Based in ${countryName(country)}.`);
  parts.push('They are interested. Closing is on you. Connecting now.');

  const twiml =
    `<?xml version="1.0" encoding="UTF-8"?><Response>` +
    `<Say voice="Polly.Matthew-Neural">${escapeXml(parts.join(' '))}</Say>` +
    `</Response>`;

  return new Response(twiml, {
    status: 200,
    headers: { 'Content-Type': 'text/xml; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/** Twilio also POSTs when the url is configured that way. */
export const POST = GET;

function countryName(code: string): string {
  const names: Record<string, string> = {
    PH: 'the Philippines', AE: 'the U A E', SA: 'Saudi Arabia', QA: 'Qatar',
    SG: 'Singapore', IN: 'India', GB: 'the U K', AU: 'Australia', US: 'the U S',
  };
  return names[code.toUpperCase()] ?? code;
}

function escapeXml(s: string) {
  return String(s).replace(/[<>&"']/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c] ?? c
  );
}

void ok;
