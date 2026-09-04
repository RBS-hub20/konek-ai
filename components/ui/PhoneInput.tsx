'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import {
  AsYouType,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js/min';
import { cn } from '@/lib/utils';
import { DEFAULT_COUNTRY, type PhoneValue } from './phoneTypes';

/* ═══════════════════════════════════════════════════════════════════
   Country picker + national number, emitting E.164.

   The backend only ever sees E.164, so this is purely about not making
   someone type "+63" on a phone keypad. libphonenumber-js does the
   parsing and validation; the UI is ours so it matches everything else.
   ═══════════════════════════════════════════════════════════════════ */

interface Country {
  code: CountryCode;
  name: string;
  flag: string;
}

/* Ordered by where the calls actually go. */
const COUNTRIES: Country[] = [
  { code: 'PH', name: 'Philippines', flag: '🇵🇭' },
  { code: 'AE', name: 'United Arab Emirates', flag: '🇦🇪' },
  { code: 'US', name: 'United States', flag: '🇺🇸' },
  { code: 'SA', name: 'Saudi Arabia', flag: '🇸🇦' },
  { code: 'SG', name: 'Singapore', flag: '🇸🇬' },
  { code: 'IN', name: 'India', flag: '🇮🇳' },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧' },
  { code: 'AU', name: 'Australia', flag: '🇦🇺' },
  { code: 'CA', name: 'Canada', flag: '🇨🇦' },
  { code: 'HK', name: 'Hong Kong', flag: '🇭🇰' },
  { code: 'MY', name: 'Malaysia', flag: '🇲🇾' },
  { code: 'QA', name: 'Qatar', flag: '🇶🇦' },
];

const dial = (c: CountryCode) => `+${getCountryCallingCode(c)}`;

/**
 * Groups the national digits for display.
 *
 * AsYouType is right while someone is still typing, but it leaves a finished
 * number ungrouped in several countries (PH and AE among them). Once the
 * number is complete, the international format minus the dial code gives the
 * grouping people actually recognise.
 */
function displayNational(digits: string, country: CountryCode): string {
  if (!digits) return '';
  const parsed = parsePhoneNumberFromString(digits, country);
  if (parsed?.isValid()) {
    return parsed
      .formatInternational()
      .replace(new RegExp(`^\\+${getCountryCallingCode(country)}\\s*`), '');
  }
  return new AsYouType(country).input(digits);
}

export function PhoneInput({
  value,
  onChange,
  autoFocus,
  onEnter,
  id,
}: {
  value: PhoneValue;
  onChange: (v: PhoneValue) => void;
  autoFocus?: boolean;
  onEnter?: () => void;
  id?: string;
}) {
  const [national, setNational] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const country = value.country ?? DEFAULT_COUNTRY;

  const selected = useMemo(
    () => COUNTRIES.find((c) => c.code === country) ?? COUNTRIES[0],
    [country]
  );

  /* Close the menu on an outside click or Escape. */
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const emit = (raw: string, c: CountryCode) => {
    const parsed = parsePhoneNumberFromString(raw, c);
    onChange({
      e164: parsed?.number ?? null,
      country: c,
      valid: Boolean(parsed?.isValid()),
    });
  };

  const handleInput = (input: string) => {
    /* Someone pasted or typed a full international number: adopt its country
       and keep only the national part, so the prefix is never doubled. */
    if (input.trim().startsWith('+')) {
      const parsed = parsePhoneNumberFromString(input.trim());
      if (parsed?.country) {
        const rest = parsed.nationalNumber ?? '';
        setNational(displayNational(rest, parsed.country));
        emit(rest, parsed.country);
        return;
      }
      /* Still typing the prefix — match on the dial code alone. */
      const digits = input.replace(/[^\d]/g, '');
      const match = COUNTRIES.find(
        (c) => digits.startsWith(getCountryCallingCode(c.code)) && digits.length > getCountryCallingCode(c.code).length
      );
      if (match) {
        const rest = digits.slice(getCountryCallingCode(match.code).length);
        setNational(displayNational(rest, match.code));
        emit(rest, match.code);
        return;
      }
      setNational(input.trim());
      onChange({ e164: null, country, valid: false });
      return;
    }

    /* A trunk prefix is how the number is written locally, not how it dials:
       0921… in PH is really +63 921…. */
    let digits = input.replace(/[^\d]/g, '');
    if (digits.startsWith('0')) digits = digits.replace(/^0+/, '');

    setNational(displayNational(digits, country));
    emit(digits, country);
  };

  const pick = (c: CountryCode) => {
    setOpen(false);
    const digits = national.replace(/[^\d]/g, '');
    setNational(displayNational(digits, c));
    emit(digits, c);
  };

  return (
    <div ref={wrapRef} className="relative">
      <div
        className={cn(
          'flex h-10 items-stretch overflow-hidden rounded-brand border bg-paper transition-colors',
          value.e164 && !value.valid ? 'border-red-400' : 'border-line focus-within:border-ink'
        )}
      >
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={`Country: ${selected.name}`}
          aria-expanded={open}
          className="flex shrink-0 items-center gap-1.5 border-r border-line px-3 text-[13px] text-ink transition-colors hover:bg-surface focus-ring"
        >
          <span className="text-[15px] leading-none">{selected.flag}</span>
          <span className="tabular-nums">{dial(country)}</span>
          <ChevronDown className={cn('h-3 w-3 text-muted transition-transform', open && 'rotate-180')} />
        </button>

        <input
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          autoFocus={autoFocus}
          value={national}
          onChange={(e) => handleInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
          placeholder={placeholderFor(country)}
          className="w-full bg-transparent px-3 text-[13px] tabular-nums text-ink outline-none placeholder:text-muted"
        />
      </div>

      {open && (
        <ul
          role="listbox"
          className="absolute z-50 mt-1.5 max-h-60 w-full overflow-y-auto rounded-brand border border-line bg-paper py-1 shadow-sm"
        >
          {COUNTRIES.map((c) => (
            <li key={c.code}>
              <button
                type="button"
                role="option"
                aria-selected={c.code === country}
                onClick={() => pick(c.code)}
                className={cn(
                  'flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors hover:bg-surface',
                  c.code === country ? 'text-ink' : 'text-muted'
                )}
              >
                <span className="text-[15px] leading-none">{c.flag}</span>
                <span className="flex-1 truncate">{c.name}</span>
                <span className="tabular-nums text-muted">{dial(c.code)}</span>
                {c.code === country && <Check className="h-3.5 w-3.5 text-ink" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** An example number in the selected country, so the format is obvious. */
function placeholderFor(c: CountryCode): string {
  const examples: Partial<Record<CountryCode, string>> = {
    PH: '921 487 8257',
    AE: '50 118 4402',
    US: '555 123 4567',
    SA: '50 123 4567',
    SG: '8123 4567',
    IN: '98765 43210',
    GB: '7400 123456',
    AU: '412 345 678',
    CA: '555 123 4567',
    HK: '5123 4567',
    MY: '12 345 6789',
    QA: '3312 3456',
  };
  return examples[c] ?? 'Phone number';
}

export { COUNTRIES, DEFAULT_COUNTRY };
export type { PhoneValue };
