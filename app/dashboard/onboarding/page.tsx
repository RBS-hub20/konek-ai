'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check, Sparkles } from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Field, Input, Select, Textarea } from '@/components/ui/Input';
import { PhoneInput } from '@/components/ui/PhoneInput';
import type { PhoneValue } from '@/components/ui/phoneTypes';
import type { CountryCode } from 'libphonenumber-js';
import { INCLUDED, KEEP_CINDY, STAFF_COMPARISON, TRIAL_DAYS, PRICE } from '@/lib/trial';
import { forgetTrial, recallTrial } from '@/lib/trialSession';
import { cn } from '@/lib/utils';

export default function OnboardingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-paper" />}>
      <Onboarding />
    </Suspense>
  );
}

const INDUSTRIES = [
  'Laundry', 'Salon', 'Clinic', 'Restaurant', 'Cafe', 'Gym',
  'Auto Shop', 'Real Estate', 'Retail', 'Other',
];

const COUNTRIES = [
  { code: 'PH', label: '🇵🇭 Philippines' },
  { code: 'AE', label: '🇦🇪 UAE' },
  { code: 'SA', label: '🇸🇦 Saudi Arabia' },
  { code: 'SG', label: '🇸🇬 Singapore' },
  { code: 'US', label: '🇺🇸 United States' },
];

const VIBES = [
  { id: 'PRO_CLOSER', label: 'Pro Closer', line: 'Calm, direct, gets to the point.' },
  { id: 'FRIENDLY', label: 'Friendly', line: 'Warm and easy — good for walk-in trade.' },
  { id: 'LUXURY', label: 'Luxury', line: 'Unhurried and precise, for premium work.' },
  { id: 'HYPE', label: 'Hype', line: 'High energy, for promos and launches.' },
];

const STEPS = ['Your business', 'What you sell', 'How she sounds', KEEP_CINDY.heading] as const;

function Onboarding() {
  const router = useRouter();
  const params = useSearchParams();
  const fromTrial = params.get('from') === 'trial';

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    businessName: '',
    industry: 'Laundry',
    country: 'PH',
    ownerName: '',
    ownerEmail: '',
    whatYouSell: '',
    goal: 'Book',
    vibe: 'PRO_CLOSER',
    language: 'TAGLISH',
  });
  const [handoff, setHandoff] = useState<PhoneValue>({ e164: null, country: 'PH', valid: false });
  const [prefilled, setPrefilled] = useState(false);
  const [trialCallId, setTrialCallId] = useState<string | null>(null);

  /* Someone arriving from the free call already told us three of these. Asking
     again is the fastest way to lose them. */
  useEffect(() => {
    const t = recallTrial();
    if (!t) return;
    setForm((f) => ({
      ...f,
      businessName: t.businessName || f.businessName,
      industry: t.industry || f.industry,
      country: t.country || f.country,
      language: (t.country || f.country) === 'PH' ? 'TAGLISH' : 'EN',
    }));
    if (t.country) setHandoff((h) => ({ ...h, country: t.country as CountryCode }));
    setTrialCallId(t.callId);
    setPrefilled(true);
  }, []);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const canAdvance =
    step === 0 ? form.businessName.trim().length > 1
    : step === 1 ? form.whatYouSell.trim().length > 3
    : true;

  const finish = async () => {
    setSaving(true); setError(null);
    try {
      const res = await fetch('/api/trial/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          businessName: form.businessName.trim(),
          handoffNumber: handoff.e164 ?? '',
          callId: trialCallId,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setError(body.error ?? 'Could not start the trial.'); return; }
      forgetTrial();
      router.push('/admin?trial=started');
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-line">
        <div className="shell flex h-16 items-center justify-between">
          <Link href="/" className="focus-ring rounded-brand"><Logo size="md" /></Link>
          <span className="text-[12px] tabular-nums text-muted">Step {step + 1} of {STEPS.length}</span>
        </div>
      </header>

      <main className="shell max-w-2xl py-12 md:py-16">
        <Progress step={step} />

        {prefilled && step === 0 && (
          <div className="mb-6 flex items-start gap-2.5 rounded-brand border border-line bg-surface p-3.5">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
            <p className="text-[12px] leading-relaxed text-muted">
              Filled in from your free call. Change anything that is not right.
            </p>
          </div>
        )}

        {/* Keyed, with no exit animation on purpose. mode="wait" holds the
            outgoing panel until its exit finishes, and a tab that is not
            painting never finishes one — the wizard then advances its state
            while the screen still shows the previous step. */}
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        >
          {step === 0 && (
            <StepShell title="Who is Cindy answering for?" body="This is the name she says out loud on every call.">
                <Field label="Business name">
                  <Input value={form.businessName} onChange={(e) => set('businessName', e.target.value)} placeholder="Natsu Cafe" autoFocus />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Industry">
                    <Select value={form.industry} onChange={(e) => set('industry', e.target.value)}>
                      {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
                    </Select>
                  </Field>
                  <Field label="Country" hint="Decides the language she opens in.">
                    <Select
                      value={form.country}
                      onChange={(e) => {
                        set('country', e.target.value);
                        set('language', e.target.value === 'PH' ? 'TAGLISH' : 'EN');
                        setHandoff((h) => ({ ...h, country: e.target.value as CountryCode }));
                      }}
                    >
                      {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
                    </Select>
                  </Field>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Your name" hint="Optional.">
                    <Input value={form.ownerName} onChange={(e) => set('ownerName', e.target.value)} placeholder="Maria Santos" />
                  </Field>
                  <Field label="Your email" hint="Optional — where the call summaries go.">
                    <Input type="email" value={form.ownerEmail} onChange={(e) => set('ownerEmail', e.target.value)} placeholder="maria@natsucafe.ph" />
                  </Field>
                </div>
              </StepShell>
            )}

          {step === 1 && (
            <StepShell title="What should she talk about?" body="A few lines is enough. She works from this on every call.">
                <Field label="What you sell" hint="Services, rough prices, anything a caller always asks.">
                  <Textarea
                    value={form.whatYouSell}
                    onChange={(e) => set('whatYouSell', e.target.value)}
                    placeholder={'Wash and fold ₱180/kg, next-day.\nDry cleaning from ₱350.\nFree pickup within 3km.'}
                    autoFocus
                  />
                </Field>
                <Field label="What a good call ends with">
                  <Select value={form.goal} onChange={(e) => set('goal', e.target.value)}>
                    <option value="Book">A booking</option>
                    <option value="Quote">A quote sent</option>
                    <option value="Explain">A question answered</option>
                    <option value="Transfer">Handed to me</option>
                  </Select>
                </Field>
              </StepShell>
            )}

          {step === 2 && (
            <StepShell title="How should she sound?" body="Switchable later — nothing here is locked in.">
                <div className="grid gap-3 sm:grid-cols-2">
                  {VIBES.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => set('vibe', v.id)}
                      className={cn(
                        'rounded-brand border p-4 text-left transition-colors focus-ring',
                        form.vibe === v.id ? 'border-ink bg-surface' : 'border-line hover:bg-surface'
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[13px] font-medium text-ink">{v.label}</span>
                        {form.vibe === v.id && <Check className="h-3.5 w-3.5 text-accent" />}
                      </div>
                      <p className="mt-1.5 text-[12px] leading-relaxed text-muted">{v.line}</p>
                    </button>
                  ))}
                </div>
                <Field label="Language">
                  <Select value={form.language} onChange={(e) => set('language', e.target.value)}>
                    <option value="EN">English</option>
                    <option value="TAGLISH">Taglish</option>
                    <option value="TL">Tagalog</option>
                    <option value="AR">Arabic</option>
                    <option value="HI">Hindi</option>
                  </Select>
                </Field>
                <Field
                  label="Transfer hot callers to"
                  hint="Optional. The moment someone is ready to buy, Cindy rings this phone and hands the call over."
                >
                  <PhoneInput value={handoff} onChange={setHandoff} />
                </Field>
              </StepShell>
            )}

          {step === 3 && <KeepCindyStep businessName={form.businessName || 'your business'} />}
        </motion.div>

        {error && <p className="mt-5 text-[12px] text-red-500">{error}</p>}

        <div className="mt-9 flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            className="gap-1.5"
            onClick={() => (step === 0 ? router.push(fromTrial ? '/dashboard/welcome' : '/') : setStep(step - 1))}
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </Button>

          {step < STEPS.length - 1 ? (
            <Button className="gap-2" disabled={!canAdvance} onClick={() => setStep(step + 1)}>
              Continue <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button size="lg" className="gap-2" disabled={saving} onClick={() => void finish()}>
              {saving ? 'Starting…' : KEEP_CINDY.cta} {!saving && <ArrowRight className="h-4 w-4" />}
            </Button>
          )}
        </div>
      </main>
    </div>
  );
}

/* ── Pieces ──────────────────────────────────────────────────────── */

function Progress({ step }: { step: number }) {
  return (
    <div className="mb-9 flex gap-2">
      {STEPS.map((label, i) => (
        <div key={label} className="flex-1">
          <div className={cn('h-1 rounded-full transition-colors', i <= step ? 'bg-ink' : 'bg-line')} />
          <div className={cn('mt-2 text-[11px] transition-colors', i <= step ? 'text-ink' : 'text-muted')}>
            {label}
          </div>
        </div>
      ))}
    </div>
  );
}

function StepShell({ title, body, children }: { title: string; body: string; children: React.ReactNode }) {
  return (
    <section>
      <h1 className="font-display text-[26px] font-semibold leading-tight tracking-[-0.02em] text-ink sm:text-[30px]">
        {title}
      </h1>
      <p className="mt-2.5 text-[14px] leading-relaxed text-muted">{body}</p>
      <div className="mt-8 space-y-5">{children}</div>
    </section>
  );
}

/* The last step used to be where a paywall would go. It is the opposite: the
   work is already done, and switching her on costs nothing today. */
function KeepCindyStep({ businessName }: { businessName: string }) {
  return (
    <section>
      <Badge tone="accent">{KEEP_CINDY.heading}</Badge>
      <h1 className="mt-4 font-display text-[26px] font-semibold leading-tight tracking-[-0.02em] text-ink sm:text-[30px]">
        Your AI is ready. Start your {TRIAL_DAYS}-day free trial to make her live.
      </h1>
      <p className="mt-3 text-[14px] leading-relaxed text-muted">
        No credit card needed for the trial. After that {PRICE.symbol}{PRICE.monthly}/mo, and you can
        stop any time from the dashboard.
      </p>

      <div className="mt-7 grid gap-px overflow-hidden rounded-brand border border-line bg-line sm:grid-cols-2">
        <div className="bg-surface p-5">
          <div className="text-[12px] font-medium uppercase tracking-wide text-muted">
            {STAFF_COMPARISON.staff.label}
          </div>
          <div className="mt-2 font-display text-[26px] font-semibold text-muted line-through decoration-1">
            {STAFF_COMPARISON.staff.price}
          </div>
          <div className="mt-1.5 text-[12px] text-muted">{STAFF_COMPARISON.staff.catch}</div>
        </div>
        <div className="bg-paper p-5">
          <div className="text-[12px] font-medium uppercase tracking-wide text-ink">
            {STAFF_COMPARISON.cindy.label}
          </div>
          <div className="mt-2 font-display text-[26px] font-semibold text-ink">
            {PRICE.symbol}{PRICE.monthly}<span className="text-[14px] font-normal text-muted">/mo</span>
          </div>
          <div className="mt-1.5 text-[12px] text-accent">{STAFF_COMPARISON.cindy.catch}</div>
        </div>
      </div>

      <ul className="mt-7 grid gap-3 sm:grid-cols-2">
        {INCLUDED.map((f) => (
          <li key={f} className="flex items-start gap-2.5 text-[13px] text-ink">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <p className="mt-7 text-[12px] text-muted">
        {businessName} goes live the moment you press the button. {KEEP_CINDY.socialProof}.
      </p>
    </section>
  );
}
