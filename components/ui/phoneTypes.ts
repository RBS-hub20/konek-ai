/* `import type` is erased at compile time, so this pulls in no metadata. */
import type { CountryCode } from 'libphonenumber-js';

/* Kept apart from PhoneInput.tsx so a component can hold phone state without
   pulling in the phone-number metadata bundle. */

export const DEFAULT_COUNTRY: CountryCode = 'PH';

export interface PhoneValue {
  /** E.164, or null while the number is incomplete. */
  e164: string | null;
  country: CountryCode;
  valid: boolean;
}
