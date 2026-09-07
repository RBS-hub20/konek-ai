'use client';

import { useRef, useState } from 'react';
import { Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, Select, Textarea } from '@/components/ui/Input';
import { api } from '@/lib/apiClient';

const SAMPLE = `business_name,phone,industry,contact_name
Bubbles Laundry,09171234567,Laundry,Maria
Natsu Cafe,09181234567,Cafe,
Jemar Fitness,0501184402,Fitness,Ahmed`;

const COUNTRIES = [
  { code: 'PH', label: '🇵🇭 Philippines' },
  { code: 'AE', label: '🇦🇪 UAE' },
  { code: 'SA', label: '🇸🇦 Saudi Arabia' },
  { code: 'SG', label: '🇸🇬 Singapore' },
  { code: 'US', label: '🇺🇸 United States' },
];

/**
 * Bulk import.
 *
 * Takes a file or a paste, because the list usually arrives as either. Rows
 * that cannot be dialled are reported by line number rather than silently
 * dropped — a list where six numbers are wrong is worth fixing, not
 * guessing at.
 */
export function LeadImport({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [csv, setCsv] = useState('');
  const [country, setCountry] = useState('PH');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: number; skipped: number; details: { row: number; value: string; why: string }[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const run = async () => {
    if (!csv.trim()) return;
    setBusy(true); setError(null); setResult(null);
    try {
      const res = await api.importLeads(csv, country);
      setResult(res);
      if (res.created) onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not import that file.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:items-center"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog" aria-modal="true" aria-label="Import leads"
        className="my-auto w-full max-w-[560px] overflow-hidden rounded-brand border border-line bg-paper shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-line p-6">
          <div>
            <h2 className="font-display text-[17px] font-semibold text-ink">Import leads</h2>
            <p className="mt-1 text-[12px] leading-relaxed text-muted">
              A header row plus <span className="text-ink">business_name</span> and{' '}
              <span className="text-ink">phone</span>. industry, contact_name, country and notes are
              used when present.
            </p>
          </div>
          <button
            type="button" onClick={onClose} aria-label="Close"
            className="-mr-1 -mt-1 rounded p-1.5 text-muted transition-colors hover:text-ink focus-ring"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-6">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[180px] flex-1">
              <Field label="Country for numbers without one" hint="Turns 0917… into +63917…">
                <Select value={country} onChange={(e) => setCountry(e.target.value)}>
                  {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
                </Select>
              </Field>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv,text/plain"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) setCsv(await f.text());
                e.target.value = '';
              }}
            />
            <Button variant="secondary" className="gap-1.5" onClick={() => fileRef.current?.click()}>
              <Upload className="h-3.5 w-3.5" /> Choose a file
            </Button>
          </div>

          <Field label="CSV">
            <Textarea
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
              placeholder={SAMPLE}
              className="min-h-[160px] font-mono text-[12px]"
            />
          </Field>

          {error && <p className="text-[12px] text-red-500">{error}</p>}

          {result && (
            <div className="rounded-brand border border-line bg-surface p-4">
              <div className="text-[13px] font-medium text-ink">
                {result.created} lead{result.created === 1 ? '' : 's'} imported
                {result.skipped > 0 && <span className="text-muted"> · {result.skipped} skipped</span>}
              </div>
              {result.details.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {result.details.map((d) => (
                    <li key={`${d.row}-${d.value}`} className="text-[11px] leading-relaxed text-muted">
                      <span className="tabular-nums text-ink">Line {d.row}</span> — {d.value}: {d.why}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line bg-surface px-6 py-4">
          <button type="button" onClick={onClose} className="text-[12px] text-muted hover:text-ink focus-ring">
            {result?.created ? 'Done' : 'Cancel'}
          </button>
          <Button disabled={busy || !csv.trim()} onClick={() => void run()}>
            {busy ? 'Importing…' : 'Import'}
          </Button>
        </div>
      </div>
    </div>
  );
}
