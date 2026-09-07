'use client';

import { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useKonekStore } from '@/lib/store';
import {
  INCLUDED, KEEP_CINDY, PRICE, STAFF_COMPARISON, TRIAL_DAYS,
  isSubscribed, trialLabel, trialState,
} from '@/lib/trial';
import { cn } from '@/lib/utils';

type Interval = 'monthly' | 'yearly';

/* Called "Keep Cindy" rather than Billing everywhere a customer can see it —
   nobody wants to buy a subscription, they want to keep the receptionist who
   has been answering their phone. */
export function BillingTab() {
  const business = useKonekStore((s) => s.business);
  const [interval, setInterval] = useState<Interval>(
    (business?.billing_interval as Interval) === 'yearly' ? 'yearly' : 'monthly'
  );
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const t = trialState(business);
  const subscribed = isSubscribed(business);

  const price = interval === 'yearly' ? PRICE.yearly : PRICE.monthly;
  const per = interval === 'yearly' ? '/year' : '/month';
  /* Ten months' money for twelve months' service. */
  const monthlyEquivalent = interval === 'yearly' ? Math.round(PRICE.yearly / 12) : PRICE.monthly;

  const checkout = async () => {
    setBusy(true); setNotice(null);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan: 'starter',
          interval,
          businessId: business?.id,
          email: business?.owner_email ?? undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setNotice(body.error ?? 'Could not open checkout.'); return; }
      if (body.mock) {
        setNotice('Stripe is not configured on this deployment yet, so there is nothing to pay through. Add STRIPE_SECRET_KEY to switch this on.');
        return;
      }
      if (body.url) window.location.href = body.url;
    } catch {
      setNotice('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      {/* Where they stand */}
      <section className="rounded-brand border border-line bg-surface p-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-[13px] font-medium text-ink">
            {subscribed ? 'Cindy is live' : t.started ? trialLabel(t) : 'No plan yet'}
          </span>
          {subscribed && <Badge tone="success">active</Badge>}
          {!subscribed && t.active && <Badge tone="accent">trial</Badge>}
          {!subscribed && t.expired && <Badge tone="warning">ended</Badge>}
        </div>
        <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
          {subscribed
            ? `Billed ${business?.billing_interval === 'yearly' ? 'yearly' : 'monthly'}. Cancel any time — she keeps answering until the end of the period.`
            : t.active
              ? 'Everything works during the trial. Add a card whenever you are ready and nothing changes.'
              : `Your ${TRIAL_DAYS} free days are done. Keep her live and your setup carries straight over.`}
        </p>
      </section>

      {/* The price */}
      <section className="overflow-hidden rounded-brand border-2 border-ink bg-paper">
        <div className="p-6 md:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-[18px] font-semibold text-ink">{KEEP_CINDY.heading}</h2>
              <p className="mt-1 text-[12px] text-muted">{KEEP_CINDY.reassurance}</p>
            </div>
            <IntervalToggle value={interval} onChange={setInterval} />
          </div>

          <div className="mt-7 flex flex-wrap items-baseline gap-2">
            <span className="font-display text-[44px] font-semibold leading-none tracking-tight text-ink">
              {PRICE.symbol}{price}
            </span>
            <span className="text-[14px] text-muted">{per}</span>
            {interval === 'yearly' && (
              <span className="ml-1 rounded-full bg-accent/15 px-2.5 py-1 text-[11px] font-medium text-accent">
                2 months free — {PRICE.symbol}{monthlyEquivalent}/mo
              </span>
            )}
          </div>

          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {INCLUDED.map((f) => (
              <li key={f} className="flex items-start gap-2.5 text-[13px] text-ink">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
                <span>{f}</span>
              </li>
            ))}
          </ul>

          <Button size="lg" className="mt-8 w-full gap-2" disabled={busy} onClick={() => void checkout()}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {subscribed
              ? 'Change plan'
              : `Keep Cindy — ${PRICE.symbol}${price}${interval === 'yearly' ? '/yr' : '/mo'}`}
          </Button>
          {notice && <p className="mt-4 text-[12px] leading-relaxed text-muted">{notice}</p>}
          <p className="mt-3 text-center text-[11px] text-muted">{KEEP_CINDY.socialProof}</p>
        </div>
      </section>

      {/* What it replaces */}
      <section className="grid gap-px overflow-hidden rounded-brand border border-line bg-line sm:grid-cols-2">
        <div className="bg-surface p-5">
          <div className="text-[12px] font-medium uppercase tracking-wide text-muted">
            {STAFF_COMPARISON.staff.label}
          </div>
          <div className="mt-2 font-display text-[24px] font-semibold text-muted line-through decoration-1">
            {STAFF_COMPARISON.staff.price}
          </div>
          <div className="mt-1.5 text-[12px] text-muted">{STAFF_COMPARISON.staff.catch}</div>
        </div>
        <div className="bg-paper p-5">
          <div className="text-[12px] font-medium uppercase tracking-wide text-ink">
            {STAFF_COMPARISON.cindy.label}
          </div>
          <div className="mt-2 font-display text-[24px] font-semibold text-ink">
            {PRICE.symbol}{PRICE.monthly}<span className="text-[13px] font-normal text-muted">/mo</span>
          </div>
          <div className="mt-1.5 text-[12px] text-accent">{STAFF_COMPARISON.cindy.catch}</div>
        </div>
      </section>
    </div>
  );
}

function IntervalToggle({ value, onChange }: { value: Interval; onChange: (v: Interval) => void }) {
  return (
    <div className="inline-flex rounded-brand border border-line bg-surface p-1" role="group" aria-label="Billing period">
      {(['monthly', 'yearly'] as const).map((k) => (
        <button
          key={k}
          type="button"
          aria-pressed={value === k}
          onClick={() => onChange(k)}
          className={cn(
            'rounded-[9px] px-3.5 py-1.5 text-[12px] font-medium transition-colors focus-ring',
            value === k ? 'bg-paper text-ink shadow-sm' : 'text-muted hover:text-ink'
          )}
        >
          {k === 'monthly' ? 'Monthly' : 'Yearly'}
        </button>
      ))}
    </div>
  );
}
