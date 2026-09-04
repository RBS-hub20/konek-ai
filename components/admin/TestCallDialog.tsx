'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { PhoneCall, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Input';
import dynamic from 'next/dynamic';
import { DEFAULT_COUNTRY, type PhoneValue } from '@/components/ui/phoneTypes';

/* The phone metadata is ~40kB and only matters once this dialog is open, so
   it is fetched on demand rather than shipped with the dashboard. */
const PhoneInput = dynamic(() => import('@/components/ui/PhoneInput').then((m) => m.PhoneInput), {
  ssr: false,
  loading: () => <div className="h-10 rounded-brand border border-line bg-surface" />,
});
import { Badge } from '@/components/ui/Badge';
import { api, type PlaceCallResult } from '@/lib/apiClient';
import { needsUnlock, useKonekStore } from '@/lib/store';
import { vibeToLabel } from '@/lib/types2';
import { LANGUAGES, type LanguageKey } from '@/lib/ai/languages';
import { UnlockDialog } from './UnlockDialog';

/** "Test call myself" — dials the number you type, in the selected vibe. */
export function TestCallDialog({
  open,
  onClose,
  vibe,
  language = 'EN',
}: {
  open: boolean;
  onClose: () => void;
  vibe: string;
  language?: LanguageKey;
}) {
  const { businessId, business, liveCallsEnabled, refreshSession, loadCalls, loadOverview } = useKonekStore();
  const [phone, setPhone] = useState<PhoneValue>({ e164: null, country: DEFAULT_COUNTRY, valid: false });
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PlaceCallResult | null>(null);
  const [showUnlock, setShowUnlock] = useState(false);

  useEffect(() => {
    if (open) {
      setResult(null);
      setError(null);
      void refreshSession();
    }
  }, [open, refreshSession]);

  const place = async () => {
    const to = phone.e164;
    if (!to || !phone.valid) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.placeCall({
        to,
        customerName: name.trim() || undefined,
        vibe,
        language,
        business_id: businessId ?? undefined,
      });
      setResult(res as PlaceCallResult);
      await Promise.all([loadCalls(), loadOverview()]);
    } catch (err) {
      if (needsUnlock(err)) {
        setShowUnlock(true);
      } else {
        setError(err instanceof Error ? err.message : 'Call failed');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            key="testcall-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
            onClick={onClose}
          >
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-brand border border-line bg-paper p-6"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-brand border border-line">
                    <PhoneCall className="h-4 w-4 text-ink" />
                  </span>
                  <div>
                    <h3 className="font-display text-[15px] font-semibold text-ink">Test call myself</h3>
                    <p className="mt-0.5 text-[11px] text-muted">
                      {vibeToLabel(vibe)} · {LANGUAGES[language].label} · from{' '}
                      {business?.outbound_number ?? 'your Twilio number'}
                    </p>
                  </div>
                </div>
                <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-muted hover:text-ink focus-ring">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-6 space-y-4">
                <Field
                  label="Your phone number"
                  hint={
                    phone.e164 && !phone.valid
                      ? 'That does not look like a valid number for this country yet.'
                      : 'Pick your country, then type the number as you would locally.'
                  }
                >
                  <PhoneInput value={phone} onChange={setPhone} autoFocus onEnter={place} />
                </Field>
                <Field label="Your name (optional)">
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Renmar" />
                </Field>
              </div>

              {/* Exactly what will be dialled, in the format Twilio receives. */}
              {phone.e164 && phone.valid && (
                <p className="mt-4 text-[12px] leading-relaxed text-muted">
                  Calling <span className="tabular-nums text-ink">{phone.e164}</span>
                  {business?.outbound_number && (
                    <> from <span className="tabular-nums text-ink">{business.outbound_number}</span></>
                  )}
                </p>
              )}

              {!liveCallsEnabled && (
                <p className="mt-4 rounded-brand border border-line bg-surface p-3 text-[12px] leading-relaxed text-muted">
                  Twilio is not configured on this server, so the call will be logged but nobody will be dialled.
                </p>
              )}

              {error && <p className="mt-4 text-[12px] leading-relaxed text-red-500">{error}</p>}

              {result && (
                <div className="mt-4 rounded-brand border border-accent bg-accent/[0.05] p-4">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone="accent">{result.mock ? 'Logged (mock)' : 'Dialling'}</Badge>
                    <Badge>{vibeToLabel(result.vibe)}</Badge>
                    {result.skillsUsed.map((s) => <Badge key={s}>{s}</Badge>)}
                  </div>
                  <p className="mt-3 text-[12.5px] leading-relaxed text-ink">
                    {result.mock
                      ? `Recorded a call to ${result.to}. Configure Twilio to dial for real.`
                      : `Calling ${result.to} from ${result.from} now — your phone should ring in a few seconds.`}
                  </p>
                  {result.warning && <p className="mt-2 text-[11px] text-muted">{result.warning}</p>}
                </div>
              )}

              <div className="mt-6 flex gap-2">
                <Button size="sm" onClick={place} disabled={busy || !phone.valid}>
                  {busy ? 'Calling…' : result ? 'Call again' : 'Call me now'}
                </Button>
                <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <UnlockDialog open={showUnlock} onClose={() => setShowUnlock(false)} onUnlocked={place} />
    </>
  );
}
