'use client';

import { CalendarCheck, Flame, PhoneCall, PhoneForwarded } from 'lucide-react';
import { StatCard } from '@/components/ui/StatCard';
import { Badge } from '@/components/ui/Badge';
import { Progress } from '@/components/ui/Progress';
import { CALL_LOGS, CAMPAIGNS } from '@/lib/mockData';
import { useKonekStore } from '@/lib/store';

export function OverviewTab() {
  const { vibe, activeSkills, customSkills } = useKonekStore();

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Calls Today" value="248" delta="+12% vs yesterday" icon={<PhoneCall className="h-4 w-4" />} />
        <StatCard label="Connected" value="71%" delta="176 of 248 answered" icon={<PhoneForwarded className="h-4 w-4" />} />
        <StatCard label="Hot Leads" value="34" delta="13.7% of connected" accent icon={<Flame className="h-4 w-4" />} />
        <StatCard label="Bookings" value="19" delta="₱214,600 pipeline" icon={<CalendarCheck className="h-4 w-4" />} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        {/* Recent calls */}
        <section className="overflow-hidden rounded-brand border border-line bg-paper">
          <div className="border-b border-line px-5 py-4">
            <h2 className="font-display text-[14px] font-semibold text-ink">Recent Calls</h2>
            <p className="mt-0.5 text-[12px] text-muted">Latest conversations KONEK handled for you</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left">
              <thead>
                <tr className="border-b border-line text-[11px] uppercase tracking-wide text-muted">
                  <th className="px-5 py-3 font-medium">Customer</th>
                  <th className="px-5 py-3 font-medium">Vibe</th>
                  <th className="px-5 py-3 font-medium">Duration</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {CALL_LOGS.slice(0, 6).map((c) => (
                  <tr key={c.id} className="border-b border-line last:border-0 hover:bg-surface">
                    <td className="px-5 py-3.5">
                      <div className="text-[13px] font-medium text-ink">{c.customer}</div>
                      <div className="mt-0.5 text-[11px] tabular-nums text-muted">{c.phone}</div>
                    </td>
                    <td className="px-5 py-3.5 text-[12px] text-muted">{c.vibe}</td>
                    <td className="px-5 py-3.5 text-[12px] tabular-nums text-ink">{c.duration}</td>
                    <td className="px-5 py-3.5">
                      <Badge tone={c.status === 'Hot Lead' ? 'accent' : c.status === 'Booked' ? 'success' : 'default'}>
                        {c.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="space-y-6">
          {/* Current setup */}
          <section className="rounded-brand border border-line bg-paper p-5">
            <h2 className="font-display text-[14px] font-semibold text-ink">Current Setup</h2>
            <dl className="mt-5 space-y-4 text-[13px]">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted">Vibe</dt>
                <dd className="font-medium text-ink">{vibe}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted">Active skills</dt>
                <dd className="font-medium text-ink">{activeSkills.length} ready-made</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted">Custom skills</dt>
                <dd className="font-medium text-ink">{customSkills.length}</dd>
              </div>
            </dl>
            <div className="mt-6 border-t border-line pt-4">
              <div className="mb-2 flex items-baseline justify-between text-[12px]">
                <span className="text-muted">Calls used</span>
                <span className="tabular-nums text-ink">1,840 / 2,000</span>
              </div>
              <Progress value={1840} max={2000} tone="auto" />
            </div>
          </section>

          {/* Campaign snapshot */}
          <section className="rounded-brand border border-line bg-paper p-5">
            <h2 className="font-display text-[14px] font-semibold text-ink">Running Campaigns</h2>
            <div className="mt-5 space-y-5">
              {CAMPAIGNS.filter((c) => c.status === 'Running').map((c) => (
                <div key={c.name}>
                  <div className="flex items-baseline justify-between gap-3 text-[12px]">
                    <span className="truncate font-medium text-ink">{c.name}</span>
                    <span className="shrink-0 tabular-nums text-muted">
                      {c.done}/{c.audience}
                    </span>
                  </div>
                  <Progress value={c.done} max={c.audience} tone="accent" className="mt-2.5" />
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
