'use client';

import { useEffect } from 'react';
import { CalendarCheck, Flame, PhoneCall, PhoneForwarded } from 'lucide-react';
import { StatCard } from '@/components/ui/StatCard';
import { Badge } from '@/components/ui/Badge';
import { Progress } from '@/components/ui/Progress';
import { useKonekStore } from '@/lib/store';
import { GettingStarted } from './GettingStarted';
import { vibeToLabel } from '@/lib/types2';

const statusTone = (s: string) =>
  s === 'Hot Lead' ? 'accent' : s === 'Booked' ? 'success' : s === 'Failed' ? 'danger' : 'default';

export function OverviewTab({ onGo }: { onGo?: (tab: string) => void }) {
  const { stats, recentCalls, runningCampaigns, setup, loadOverview } = useKonekStore();

  useEffect(() => { void loadOverview(); }, [loadOverview]);

  return (
    <div className="space-y-8">
      {onGo && <GettingStarted onGo={onGo} />}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Calls Today" value={String(stats.callsToday)} delta="Since midnight" icon={<PhoneCall className="h-4 w-4" />} />
        <StatCard
          label="Connected"
          value={`${stats.connectedPct}%`}
          delta={stats.callsToday ? `of ${stats.callsToday} calls today` : 'No calls yet today'}
          icon={<PhoneForwarded className="h-4 w-4" />}
        />
        <StatCard label="Hot Leads" value={String(stats.hotLeads)} delta="Marked hot today" accent icon={<Flame className="h-4 w-4" />} />
        <StatCard label="Bookings" value={String(stats.bookings)} delta="Booked today" icon={<CalendarCheck className="h-4 w-4" />} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="overflow-hidden rounded-brand border border-line bg-paper">
          <div className="border-b border-line px-5 py-4">
            <h2 className="font-display text-[14px] font-semibold text-ink">Recent Calls</h2>
            <p className="mt-0.5 text-[12px] text-muted">Latest conversations KONEK handled for you</p>
          </div>
          {recentCalls.length === 0 ? (
            <p className="px-5 py-10 text-center text-[13px] text-muted">
              No calls yet. Place one from Vibe Mode → Test call myself, or start a campaign.
            </p>
          ) : (
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
                  {recentCalls.map((c) => (
                    <tr key={c.id} className="border-b border-line last:border-0 hover:bg-surface">
                      <td className="px-5 py-3.5">
                        <div className="text-[13px] font-medium text-ink">{c.customer_name || 'Unknown'}</div>
                        <div className="mt-0.5 text-[11px] tabular-nums text-muted">{c.phone}</div>
                      </td>
                      <td className="px-5 py-3.5 text-[12px] text-muted">{c.vibe ? vibeToLabel(c.vibe) : '—'}</td>
                      <td className="px-5 py-3.5 text-[12px] tabular-nums text-ink">
                        {Math.floor(c.duration_seconds / 60)}:{String(c.duration_seconds % 60).padStart(2, '0')}
                      </td>
                      <td className="px-5 py-3.5"><Badge tone={statusTone(String(c.status))}>{c.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="space-y-6">
          <section className="rounded-brand border border-line bg-paper p-5">
            <h2 className="font-display text-[14px] font-semibold text-ink">Current Setup</h2>
            <dl className="mt-5 space-y-4 text-[13px]">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted">Vibe</dt>
                <dd className="font-medium text-ink">{setup ? vibeToLabel(setup.vibe) : '—'}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted">Goal</dt>
                <dd className="font-medium text-ink">{setup?.goal ?? '—'}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted">Active skills</dt>
                <dd className="font-medium text-ink">{setup?.activeSkills ?? 0}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted">Custom skills</dt>
                <dd className="font-medium text-ink">{setup?.customSkills ?? 0}</dd>
              </div>
            </dl>
            <div className="mt-6 border-t border-line pt-4">
              <div className="mb-2 flex items-baseline justify-between text-[12px]">
                <span className="text-muted">Calls used</span>
                <span className="tabular-nums text-ink">
                  {(setup?.callsUsed ?? 0).toLocaleString()} / {(setup?.callsLimit ?? 0).toLocaleString()}
                </span>
              </div>
              <Progress value={setup?.callsUsed ?? 0} max={Math.max(setup?.callsLimit ?? 1, 1)} tone="auto" />
            </div>
          </section>

          <section className="rounded-brand border border-line bg-paper p-5">
            <h2 className="font-display text-[14px] font-semibold text-ink">Running Campaigns</h2>
            {runningCampaigns.length === 0 ? (
              <p className="mt-4 text-[12px] text-muted">Nothing running right now.</p>
            ) : (
              <div className="mt-5 space-y-5">
                {runningCampaigns.map((c) => (
                  <div key={c.id}>
                    <div className="flex items-baseline justify-between gap-3 text-[12px]">
                      <span className="truncate font-medium text-ink">{c.name}</span>
                      <span className="shrink-0 tabular-nums text-muted">{c.called_count}/{c.audience_count}</span>
                    </div>
                    <Progress value={c.called_count} max={Math.max(c.audience_count, 1)} tone="accent" className="mt-2.5" />
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
