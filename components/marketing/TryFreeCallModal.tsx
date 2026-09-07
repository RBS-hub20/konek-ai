'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { PhoneCall, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Input';
import { PhoneInput } from '@/components/ui/PhoneInput';
import type { PhoneValue } from '@/components/ui/phoneTypes';
import { TRIAL_DAYS } from '@/lib/trial';

/* No account, no password, no email. The visitor types three things and their
   own phone rings — that is the entire pitch, so nothing else belongs here. */

const INDUSTRIES = [
  'Laundry', 'Salon', 'Clinic', 'Restaurant', 'Cafe', 'Gym',
  'Auto Shop', 'Real Estate', 'Retail', 'Other',
];

type Stage = 'form' | 'dialling';

export function TryFreeCallModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [businessName, setBusinessName] = useState('');
  const [industry, setIndustry] = useState('Laundry');
  const [phone, setPhone] = useState<PhoneValue>({ e164: null, country: 'PH', valid: false });
  const [stage, setStage] = useState<Stage>('form');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStage('form');
    setError(null);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open, onClose]);

  const ready = businessName.trim().length > 1 && phone.valid && phone.e164;

  const submit = async () => {
    if (!ready || stage === 'dialling') return;
    setStage('dialling');
    setError(null);
    try {
      const res = await fetch('/api/try-free-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName: businessName.trim(),
          phone: phone.e164,
          country: phone.country,
          industry,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStage('form');
        setError(
          body.rateLimited
            ? `${body.error} Try again in about ${body.retryAfterHours} hour${body.retryAfterHours === 1 ? '' : 's'}.`
            : body.error ?? 'The call could not be placed.'
        );
        return;
      }

      /* The phone is already ringing. Hold the ringing state for a beat so the
         hand-off to the welcome screen does not beat the actual call. */
      const params = new URLSearchParams({
        callId: String(body.callId ?? ''),
        newUser: 'true',
        name: businessName.trim(),
        phone: String(body.to ?? phone.e164 ?? ''),
        industry,
        country: String(body.country ?? phone.country ?? ''),
      });
      setTimeout(() => router.push(`/dashboard/welcome?${params.toString()}`), 2600);
    } catch {
      setStage('form');
      setError('Could not reach the server. Check your connection and try again.');
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="try-free-call"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/55 p-4 backdrop-blur-sm sm:items-center"
          onMouseDown={(e) => { if (e.target === e.currentTarget && stage === 'form') onClose(); }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Try a free call"
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.99 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-[440px] overflow-hidden rounded-brand border border-line bg-paper shadow-2xl"
          >
            {stage === 'form' ? (
              <div className="p-6 sm:p-7">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-display text-[19px] font-semibold tracking-tight text-ink">
                      Hear Cindy call you
                    </h2>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
                      Your phone rings in about ten seconds. No sign-up, nothing to cancel.
                    </p>
                  </div>
                  <button
                    type="button" onClick={onClose} aria-label="Close"
                    className="-mr-1 -mt-1 rounded p-1.5 text-muted transition-colors hover:text-ink focus-ring"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-6 space-y-4">
                  <Field label="Business name">
                    <Input
                      autoFocus
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      placeholder="Natsu Cafe"
                      onKeyDown={(e) => e.key === 'Enter' && ready && void submit()}
                    />
                  </Field>
                  <Field label="Your phone" hint="Cindy calls this number once. It is not stored for marketing.">
                    <PhoneInput value={phone} onChange={setPhone} onEnter={() => ready && void submit()} />
                  </Field>
                  <Field label="Industry">
                    <Select value={industry} onChange={(e) => setIndustry(e.target.value)}>
                      {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
                    </Select>
                  </Field>
                </div>

                {error && <p className="mt-4 text-[12px] leading-relaxed text-red-500">{error}</p>}

                <Button size="lg" className="mt-6 w-full gap-2" disabled={!ready} onClick={() => void submit()}>
                  <PhoneCall className="h-4 w-4" /> Call My Phone Now — Free 30s
                </Button>
                <p className="mt-3 text-center text-[11px] text-muted">
                  One free call per number per day · {TRIAL_DAYS}-day trial after, no card
                </p>
              </div>
            ) : (
              <Dialling phone={phone.e164 ?? ''} />
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ── Ringing ─────────────────────────────────────────────────────── */

/* The wait is the moment the whole funnel is built around, so it gets a
   countdown rather than a spinner: the visitor should be looking at their
   phone, not at this tab. */
function Dialling({ phone }: { phone: string }) {
  const [seconds, setSeconds] = useState(10);
  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => (s > 1 ? s - 1 : 1)), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex flex-col items-center px-6 py-12 text-center sm:px-7">
      <span className="relative flex h-20 w-20 items-center justify-center">
        {[0, 0.6, 1.2].map((delay) => (
          <motion.span
            key={delay}
            className="absolute inset-0 rounded-full border border-accent"
            initial={{ opacity: 0.55, scale: 0.55 }}
            animate={{ opacity: 0, scale: 1.35 }}
            transition={{ duration: 1.8, repeat: Infinity, delay, ease: 'easeOut' }}
          />
        ))}
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white">
          <PhoneCall className="h-6 w-6" />
        </span>
      </span>

      <h2 className="mt-7 font-display text-[19px] font-semibold tracking-tight text-ink">
        Calling you in {seconds} second{seconds === 1 ? '' : 's'}…
      </h2>
      <p className="mt-2 text-[13px] leading-relaxed text-muted">
        Cindy is dialling <span className="tabular-nums text-ink">{phone}</span>. Pick up and talk to her
        like you would a real receptionist.
      </p>
      <p className="mt-6 text-[11px] text-muted">Keep this tab open — your call summary lands here.</p>
    </div>
  );
}
