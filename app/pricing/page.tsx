'use client';

import Link from 'next/link';
import { Check } from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { Button } from '@/components/ui/Button';
import {
  PLANS, MINUTES_TOOLTIP, AVERAGE_CALL_MINUTES, callsFor,
} from '@/lib/pricing';
import { TRIAL_DAYS } from '@/lib/trial';
import { cn } from '@/lib/utils';

/* Priced by the minute, because that is how it costs. The same PLANS drive
   the section on the landing page, so the two cannot disagree. */
export default function PricingPage() {
  return (
    <div className="min-h-screen bg-paper">
      <header className="sticky top-0 z-40 border-b border-line bg-paper/85 backdrop-blur-md">
        <div className="shell flex h-16 items-center justify-between">
          <Link href="/" className="focus-ring rounded-brand"><Logo size="md" /></Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link href="/dashboard/onboarding"><Button size="sm">Get Started</Button></Link>
          </div>
        </div>
      </header>

      <main className="shell py-16 md:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <span className="eyebrow">Pricing</span>
          <h1 className="mt-5 font-display text-[36px] font-semibold leading-tight tracking-[-0.03em] text-ink sm:text-[46px]">
            Pay for minutes, not for calls.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-muted">
            A ninety second enquiry and a nine minute conversation are not the same thing, so they
            are not priced the same. {MINUTES_TOOLTIP}
          </p>
          <p className="mt-4 text-[13px] text-muted">
            Every plan starts with a {TRIAL_DAYS}-day free trial. No card.
          </p>
        </div>

        <div className="mx-auto mt-14 grid max-w-5xl gap-5 lg:grid-cols-3">
          {PLANS.map((p) => (
            <div
              key={p.id}
              className={cn(
                'flex flex-col rounded-brand border bg-paper p-8',
                p.highlight ? 'border-2 border-ink' : 'border-line'
              )}
            >
              <div className="flex items-center justify-between">
                <h2 className="font-display text-[15px] font-semibold text-ink">{p.name}</h2>
                {p.highlight && (
                  <span className="rounded-full bg-ink px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-paper">
                    Most Popular
                  </span>
                )}
              </div>

              <div className="mt-7 flex items-baseline gap-1">
                <span className="font-display text-[40px] font-semibold leading-none tracking-tight text-ink">
                  {p.price}
                </span>
                {p.period && <span className="text-[13px] text-muted">{p.period}</span>}
              </div>

              <div className="mt-2.5 text-[13px] font-medium text-ink">
                {p.minutes.toLocaleString()} minutes included
              </div>
              <div className="mt-0.5 text-[12px] text-muted">{callsFor(p.minutes)}</div>

              <dl className="mt-4 space-y-1.5 border-t border-line pt-4 text-[12px]">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Max per call</dt>
                  <dd className="tabular-nums text-ink">{p.maxCallMinutes} min</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">After the allowance</dt>
                  <dd className="tabular-nums text-ink">
                    ${p.overageRate.toFixed(2)}/min{p.id === 'enterprise' ? ' · fair use' : ''}
                  </dd>
                </div>
              </dl>

              <ul className="mt-6 flex flex-1 flex-col gap-3">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-[13px] text-ink">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <Link href="/dashboard/onboarding" className="mt-9">
                <Button variant={p.highlight ? 'primary' : 'secondary'} className="w-full">
                  {p.cta}
                </Button>
              </Link>
            </div>
          ))}
        </div>

        <section className="mx-auto mt-16 max-w-2xl rounded-brand border border-line bg-surface p-6">
          <h2 className="font-display text-[15px] font-semibold text-ink">How minutes are counted</h2>
          <ul className="mt-4 space-y-2.5 text-[13px] leading-relaxed text-muted">
            <li>· Only time on a connected call counts. Ringing, busy and no-answer are free.</li>
            <li>
              · Calls are cut at the plan&rsquo;s per-call limit, so one caller who never hangs up
              cannot spend the month.
            </li>
            <li>· A typical call runs about {AVERAGE_CALL_MINUTES} minutes.</li>
            <li>· The allowance resets on the 1st. Unused minutes do not roll over.</li>
            <li>· Your dashboard shows minutes used, minutes left and anything owed on top.</li>
          </ul>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="shell flex flex-col gap-3 py-10 text-[12px] text-muted md:flex-row md:items-center md:justify-between">
          <Logo size="sm" />
          <span>© {new Date().getFullYear()} RBS Labs</span>
        </div>
      </footer>
    </div>
  );
}
