'use client';

import { useState } from 'react';
import { Clock } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Input';
import { useKonekStore } from '@/lib/store';
import { PLANS, planFor, usageFor } from '@/lib/pricing';
import { cn } from '@/lib/utils';

/* ═══════════════════════════════════════════════════════════════════
   Minutes used, minutes left, and what it costs.

   The number a customer actually wants when they think about the bill.
   Everything here is derived from the tenant's own allowance rather than
   the plan's, because an allowance can be adjusted per tenant and the
   card has to show what they were actually given.
   ═══════════════════════════════════════════════════════════════════ */

export function UsageCard() {
  const business = useKonekStore((s) => s.business);
  const update = useKonekStore((s) => s.setBusinessField);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ minutes: '', maxCall: '', rate: '' });

  if (!business) return null;

  const usage = usageFor(business);
  const plan = planFor(business.plan);

  const openEdit = () => {
    setForm({
      minutes: String(business.monthly_minutes_included ?? plan.minutes),
      maxCall: String(business.max_call_minutes ?? plan.maxCallMinutes),
      rate: String(business.overage_rate ?? plan.overageRate),
    });
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await update({
        monthly_minutes_included: Math.max(0, Number(form.minutes) || 0),
        max_call_minutes: Math.max(1, Number(form.maxCall) || 1),
        overage_rate: Math.max(0, Number(form.rate) || 0),
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-brand border border-line bg-paper p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted" />
          <h2 className="font-display text-[14px] font-semibold text-ink">Minutes this month</h2>
        </div>
        <button
          type="button"
          onClick={openEdit}
          className="text-[12px] text-accent hover:underline focus-ring"
        >
          Change plan
        </button>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-6">
        <Dial percent={usage.percent} over={usage.overLimit} />

        <div className="min-w-[180px] flex-1 space-y-1.5">
          <div className="font-display text-[22px] font-semibold tabular-nums text-ink">
            {usage.used} <span className="text-[14px] font-normal text-muted">/ {usage.included} min</span>
          </div>
          <div className="text-[12px] text-muted">
            {usage.overLimit
              ? `${usage.overageMinutes} min over — $${usage.overageCost.toFixed(2)} on top`
              : `${usage.remaining} min left`}
            {' · resets '}{usage.resetsLabel}
          </div>
          <div className="text-[12px] text-muted">
            Max {business.max_call_minutes ?? plan.maxCallMinutes} min per call · $
            {(business.overage_rate ?? plan.overageRate).toFixed(2)}/min after
          </div>
        </div>

        <div className="rounded-brand border border-line bg-surface px-4 py-3">
          <div className="text-[11px] uppercase tracking-wide text-muted">This month</div>
          <div className="mt-1 font-display text-[20px] font-semibold tabular-nums text-ink">
            ${usage.monthCost.toFixed(2)}
          </div>
          <div className="mt-0.5 text-[11px] text-muted">
            {plan.name}{usage.overageCost > 0 ? ` + $${usage.overageCost.toFixed(2)} overage` : ''}
          </div>
        </div>
      </div>

      {editing && (
        <div className="mt-5 space-y-4 border-t border-line pt-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Minutes included">
              <Input
                type="number" min={0} value={form.minutes}
                onChange={(e) => setForm({ ...form, minutes: e.target.value })}
              />
            </Field>
            <Field label="Max minutes per call" hint="Twilio cuts the call here.">
              <Input
                type="number" min={1} value={form.maxCall}
                onChange={(e) => setForm({ ...form, maxCall: e.target.value })}
              />
            </Field>
            <Field label="Overage $/min">
              <Input
                type="number" min={0} step="0.01" value={form.rate}
                onChange={(e) => setForm({ ...form, rate: e.target.value })}
              />
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {PLANS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setForm({
                  minutes: String(p.minutes),
                  maxCall: String(p.maxCallMinutes),
                  rate: String(p.overageRate),
                })}
                className="rounded-brand border border-line px-3 py-1.5 text-[12px] text-muted transition-colors hover:bg-surface hover:text-ink focus-ring"
              >
                {p.name} · {p.minutes} min
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" disabled={saving} onClick={() => void save()}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
            <button
              type="button" onClick={() => setEditing(false)}
              className="text-[12px] text-muted hover:text-ink focus-ring"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/* A ring rather than a bar: the question is "how much of it is gone",
   which a proportion answers better than a length. */
function Dial({ percent, over }: { percent: number; over: boolean }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const filled = Math.min(100, percent) / 100;

  return (
    <div className="relative h-[88px] w-[88px] shrink-0">
      <svg viewBox="0 0 88 88" className="h-full w-full -rotate-90">
        <circle cx="44" cy="44" r={r} fill="none" stroke="var(--line)" strokeWidth="8" />
        <circle
          cx="44" cy="44" r={r} fill="none" strokeWidth="8" strokeLinecap="round"
          stroke={over ? 'rgb(245 158 11)' : 'var(--accent)'}
          strokeDasharray={`${c * filled} ${c}`}
        />
      </svg>
      <span
        className={cn(
          'absolute inset-0 flex items-center justify-center font-display text-[15px] font-semibold tabular-nums',
          over ? 'text-amber-500' : 'text-ink'
        )}
      >
        {percent}%
      </span>
    </div>
  );
}
