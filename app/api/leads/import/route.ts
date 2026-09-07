import { createLead, listLeads, safe } from '@/lib/server/tenant';
import { normalizePhone, countryFromE164 } from '@/lib/server/phone';
import type { Lead } from '@/lib/types2';
import { describeError, fail, ok, readJson } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_ROWS = 500;

/**
 * POST /api/leads/import — { csv, country?, source? }
 *
 * A pasted or uploaded CSV of businesses to call. Headers are matched by
 * name, so column order does not matter and the file people already have
 * usually works: business_name, phone, industry, and optionally
 * contact_name, country, notes, source.
 *
 * Every row is reported on. A file where four rows in the middle have bad
 * numbers should import the rest and say which four were skipped, rather
 * than failing whole and leaving the operator to guess.
 */
export async function POST(req: Request) {
  const body = await readJson<{ csv?: string; country?: string; source?: string }>(req);
  const csv = body?.csv?.trim();
  if (!csv) return fail('Paste a CSV, or upload a file with a header row.');

  const parsed = parseCsv(csv);
  if ('error' in parsed) return fail(parsed.error);
  const { header, rows } = parsed;

  const col = (...names: string[]) => {
    for (const n of names) {
      const i = header.indexOf(n);
      if (i !== -1) return i;
    }
    return -1;
  };
  const iName = col('business_name', 'business', 'company', 'company_name', 'name');
  const iPhone = col('phone', 'phone_number', 'mobile', 'number');
  if (iName === -1 || iPhone === -1) {
    return fail(`The header needs at least business_name and phone. Found: ${header.join(', ') || '(nothing)'}.`);
  }
  const iIndustry = col('industry', 'category', 'type');
  const iContact = col('contact_name', 'contact', 'contact_person', 'owner');
  const iCountry = col('country', 'country_code');
  const iNotes = col('notes', 'note', 'remarks');
  const iSource = col('source', 'origin');

  if (rows.length > MAX_ROWS) return fail(`That is ${rows.length} rows. Import ${MAX_ROWS} at a time.`);

  const fallbackCountry = body?.country?.trim()?.toUpperCase() || null;
  const defaultSource = body?.source?.trim() || 'csv';

  /* Skipping a number already in the pipeline beats calling someone twice. */
  const existing = new Set((await safe(() => listLeads(1000), [])).map((l) => l.phone));

  const created: Lead[] = [];
  const skipped: { row: number; value: string; why: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const line = i + 2;                       // +1 for the header, +1 for 1-based
    const company = (r[iName] ?? '').trim();
    const rawPhone = (r[iPhone] ?? '').trim();
    if (!company && !rawPhone) continue;      // blank line
    if (!company) { skipped.push({ row: line, value: rawPhone, why: 'no business name' }); continue; }
    if (!rawPhone) { skipped.push({ row: line, value: company, why: 'no phone number' }); continue; }

    const country = (iCountry !== -1 ? r[iCountry]?.trim()?.toUpperCase() : '') || fallbackCountry;
    const n = normalizePhone(rawPhone, country);
    if (!n.valid || !n.e164) {
      skipped.push({ row: line, value: `${company} — ${rawPhone}`, why: n.reason ?? 'not a valid number' });
      continue;
    }
    if (existing.has(n.e164)) {
      skipped.push({ row: line, value: `${company} — ${n.e164}`, why: 'already in the pipeline' });
      continue;
    }
    existing.add(n.e164);

    try {
      created.push(await createLead({
        company,
        contact_person: iContact !== -1 ? (r[iContact]?.trim() || null) : null,
        phone: n.e164,
        industry: iIndustry !== -1 ? (r[iIndustry]?.trim() || null) : null,
        country: country ?? n.country ?? countryFromE164(n.e164),
        notes: iNotes !== -1 ? (r[iNotes]?.trim() || null) : null,
        source: (iSource !== -1 ? r[iSource]?.trim() : '') || defaultSource,
        status: 'New',
      }));
    } catch (err) {
      skipped.push({ row: line, value: company, why: describeError(err).detail ?? 'could not be saved' });
    }
  }

  return ok(
    {
      created: created.length,
      skipped: skipped.length,
      /* Enough to fix the file, not so much that it fills the screen. */
      details: skipped.slice(0, 20),
      leads: created,
    },
    { status: created.length ? 201 : 200 }
  );
}

/* ── CSV ─────────────────────────────────────────────────────────── */

/** Handles quoted fields, embedded commas and both line endings. */
function parseCsv(text: string): { header: string[]; rows: string[][] } | { error: string } {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === ',') { row.push(field); field = ''; continue; }
    if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f.trim())) rows.push(row);
      row = [];
      continue;
    }
    field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim())) rows.push(row);

  if (!rows.length) return { error: 'That file has no rows.' };
  const header = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  return { header, rows: rows.slice(1) };
}
