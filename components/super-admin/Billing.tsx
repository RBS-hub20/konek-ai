'use client';

import { Badge } from '@/components/ui/Badge';
import { StatCard } from '@/components/ui/StatCard';
import type { Business } from '@/lib/types2';
import { formatCurrency } from '@/lib/utils';

/* ── Billing ─────────────────────────────────────────────────────── */

export function BillingTab({ businesses }: { businesses: Business[] }) {
  const byPlan = ['starter', 'pro', 'enterprise'].map((plan) => {
    const rows = businesses.filter((b) => b.plan === plan);
    return { plan, count: rows.length, mrr: rows.reduce((s, b) => s + (b.mrr ?? 0), 0) };
  });

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-3">
        {byPlan.map((p) => (
          <StatCard
            key={p.plan}
            label={`${p.plan[0].toUpperCase() + p.plan.slice(1)} MRR`}
            value={formatCurrency(p.mrr)}
            delta={`${p.count} business${p.count === 1 ? '' : 'es'}`}
          />
        ))}
      </div>

      <section className="overflow-hidden rounded-brand border border-line bg-paper">
        <div className="border-b border-line px-5 py-4">
          <h2 className="font-display text-[14px] font-semibold text-ink">Invoices</h2>
          <p className="mt-0.5 text-[12px] text-muted">Current billing cycle</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left">
            <thead>
              <tr className="border-b border-line text-[11px] uppercase tracking-wide text-muted">
                <th className="px-5 py-3 font-medium">Business</th>
                <th className="px-5 py-3 font-medium">Plan</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {businesses.filter((b) => b.mrr > 0).map((b) => (
                <tr key={b.id} className="border-b border-line last:border-0 hover:bg-surface">
                  <td className="px-5 py-4 text-[13px] text-ink">{b.name}</td>
                  <td className="px-5 py-4"><Badge>{b.plan}</Badge></td>
                  <td className="px-5 py-4">
                    <Badge tone={b.status === 'active' ? 'success' : 'danger'}>
                      {b.status === 'active' ? 'Paid' : b.status}
                    </Badge>
                  </td>
                  <td className="px-5 py-4 text-right text-[13px] tabular-nums text-ink">{formatCurrency(b.mrr)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
