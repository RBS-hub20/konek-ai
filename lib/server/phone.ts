import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/min';

/* ═══════════════════════════════════════════════════════════════════
   Turning what someone typed into something Twilio will dial.

   A leading zero is a national trunk prefix, not part of the number:
   "09214878257" in the Philippines is +639214878257. Prefixing a "+"
   without knowing the country produces "+09214878257", which Twilio
   rejects — so the country has to be part of the conversion.
   ═══════════════════════════════════════════════════════════════════ */

export interface NormalizedPhone {
  e164: string | null;
  country: string | null;
  valid: boolean;
  reason?: string;
}

export function normalizePhone(input: string, defaultCountry?: string | null): NormalizedPhone {
  const raw = String(input ?? '').trim();
  if (!raw) return { e164: null, country: null, valid: false, reason: 'empty' };

  const country = (defaultCountry ?? undefined) as CountryCode | undefined;
  const parsed = parsePhoneNumberFromString(raw, country);

  if (parsed?.isValid()) {
    return { e164: parsed.number, country: parsed.country ?? defaultCountry ?? null, valid: true };
  }

  /* Give a reason worth reading rather than a bare false. */
  if (/^0/.test(raw) && !defaultCountry) {
    return {
      e164: null,
      country: null,
      valid: false,
      reason: `"${raw}" starts with a trunk zero, so the country cannot be worked out. Use international format, e.g. +639214878257.`,
    };
  }
  return {
    e164: parsed?.number ?? null,
    country: parsed?.country ?? defaultCountry ?? null,
    valid: false,
    reason: `"${raw}" is not a valid number${defaultCountry ? ` for ${defaultCountry}` : ''}.`,
  };
}

/** Guesses the country from a full international number. */
export function countryFromE164(phone: string): string | null {
  const parsed = parsePhoneNumberFromString(String(phone ?? '').trim());
  return parsed?.country ?? null;
}
