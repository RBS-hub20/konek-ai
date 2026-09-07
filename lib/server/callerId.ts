import { env } from '@/lib/env';

/* ═══════════════════════════════════════════════════════════════════
   Which number to call from.

   A Philippine mobile ringing from a US number mostly gets declined —
   that is not a theory, it is what a demo call to a PH number scored
   "no-answer" on. So a local caller id is used where one exists, and
   the fallback says plainly that it is a fallback.
   ═══════════════════════════════════════════════════════════════════ */

const read = (name: string) => process.env[name]?.trim() || '';

/** Per-country caller ids, by ISO country code. */
const BY_COUNTRY: Record<string, () => string> = {
  PH: () => read('TWILIO_PH_NUMBER'),
  AE: () => read('TWILIO_AE_NUMBER'),
  SA: () => read('TWILIO_SA_NUMBER'),
  SG: () => read('TWILIO_SG_NUMBER'),
  US: () => read('TWILIO_US_NUMBER'),
};

export interface CallerId {
  from: string;
  /** Where it came from, for the log line and the console. */
  source: string;
  /** True when no local number exists for this country. */
  fallback: boolean;
}

/**
 * The best caller id for a lead in `country`.
 *
 * tenantNumber is the tenant's own outbound_number, which wins for that
 * tenant's own calls but is only a fallback for the sales desk — the desk
 * calls other people's countries.
 */
export function callerIdFor(
  country: string | null | undefined,
  tenantNumber?: string | null,
  /** The sales desk's own number, which outranks a local caller id. */
  salesNumber?: string | null
): CallerId | null {
  const code = (country ?? '').toUpperCase();

  /* A prospect who misses the call rings this number back, so it has to be
     one the desk answers with its own pitch. That matters more than the
     dialling country looking local. */
  const sales = salesNumber?.trim();
  if (sales) return { from: sales, source: 'the KONEK AI sales number', fallback: false };

  const local = BY_COUNTRY[code]?.() ?? '';
  if (local) return { from: local, source: `TWILIO_${code}_NUMBER`, fallback: false };

  const tenant = tenantNumber?.trim();
  if (tenant) {
    return {
      from: tenant,
      source: "the tenant's outbound_number",
      fallback: Boolean(code),
    };
  }

  const base = env.twilioNumber;
  if (base) return { from: base, source: 'TWILIO_PHONE_NUMBER', fallback: Boolean(code) };
  return null;
}

/** What to suggest when the caller id is foreign to the lead. */
export function callerIdWarning(id: CallerId, country: string | null | undefined): string | null {
  const code = (country ?? '').toUpperCase();
  if (!id.fallback || !code) return null;
  return `Calling a ${code} number from ${id.from} (${id.source}). A local caller id answers far more often — set TWILIO_${code}_NUMBER.`;
}
