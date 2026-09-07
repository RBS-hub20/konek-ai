'use client';

import { Clock, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useKonekStore } from '@/lib/store';
import { isSubscribed, trialLabel, trialState, PRICE } from '@/lib/trial';

/**
 * The one line at the top of the dashboard that says where the tenant stands.
 *
 * Shows nothing for a paying tenant, and nothing for someone who has never
 * started a trial and never taken a call — a banner selling a trial to
 * somebody who has not seen the product yet is just noise.
 */
export function TrialBanner({ onGoBilling }: { onGoBilling: () => void }) {
  const business = useKonekStore((s) => s.business);
  const calls = useKonekStore((s) => s.calls);

  if (!business || isSubscribed(business)) return null;

  const t = trialState(business);
  const handled = calls.length;
  const onboarded = Boolean(business.onboarded_at);

  /* Nothing to say yet. */
  if (!t.started && !onboarded && handled === 0) return null;

  const expired = t.started && t.expired;

  return (
    <div
      className={
        'mb-6 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-brand border p-4 ' +
        (expired ? 'border-amber-500/50 bg-amber-500/[0.06]' : 'border-line bg-surface')
      }
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line bg-paper">
        {expired ? <Clock className="h-3.5 w-3.5 text-amber-500" /> : <Sparkles className="h-3.5 w-3.5 text-accent" />}
      </span>

      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium text-ink">
          {expired
            ? 'Your trial has ended'
            : t.started
              ? `Trial: ${trialLabel(t)}`
              : 'Cindy is set up but not on a plan yet'}
          {handled > 0 && (
            <span className="font-normal text-muted">
              {' · '}Your AI handled {handled} call{handled === 1 ? '' : 's'}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[12px] leading-relaxed text-muted">
          {expired
            ? `Keep her answering for ${PRICE.symbol}${PRICE.monthly}/mo. Everything you set up is still here.`
            : 'Upgrade to keep her live — cancel any time, nothing is locked in.'}
        </p>
      </div>

      <Button size="sm" onClick={onGoBilling} className="shrink-0">
        {expired ? 'Keep Cindy' : 'Keep Cindy live'}
      </Button>
    </div>
  );
}
