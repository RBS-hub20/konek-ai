'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity, Building2, DollarSign, ExternalLink, Flame, Loader2,
  Pause, PhoneCall, Play, Plus, Search, Trash2, X,
} from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import { Button } from '@/components/ui/Button';
import { Badge, StatusDot } from '@/components/ui/Badge';
import { Progress } from '@/components/ui/Progress';
import { StatCard } from '@/components/ui/StatCard';
import { Waveform } from '@/components/ui/Waveform';
import { Field, Input, Select } from '@/components/ui/Input';
import { api, tryApi } from '@/lib/apiClient';
import type { Business, CallLog } from '@/lib/types2';
import { vibeToLabel } from '@/lib/types2';
import { cn, formatCurrency, formatDuration, formatNumber } from '@/lib/utils';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'numbers', label: 'Number Pool' },
  { id: 'activity', label: 'Activity' },
  { id: 'billing', label: 'Billing' },
] as const;
type TabId = (typeof TABS)[number]['id'];

interface Stats {
  mrr: number; active: number; total: number; totalRows?: number;
  callsUsed: number; totalCalls: number; connectedCalls?: number;
  answeredSeconds?: number; hotLeads: number;
}

export default function SuperAdminPage() {
  const [tab, setTab] = useState<TabId>('overview');
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [stats, setStats] = useState<Stats>({ mrr: 0, active: 0, total: 0, callsUsed: 0, totalCalls: 0, hotLeads: 0 });
  const [recent, setRecent] = useState<CallLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [services, setServices] = useState<Record<string, boolean>>({});
  const [showNew, setShowNew] = useState(false);
  const [duplicates, setDuplicates] = useState(0);

  const load = useCallback(async () => {
    const [res, status] = await Promise.all([
      tryApi(() => api.allBusinesses()),
      tryApi(() => api.status()),
    ]);
    if (res) {
      setBusinesses(res.businesses);
      setStats(res.stats);
      setRecent(res.recentCalls);
      setDuplicates((res as { duplicates?: number }).duplicates ?? 0);
    }
    if (status) setServices((status.services as Record<string, boolean>) ?? {});
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    /* RBS Labs console — dark by default, independent of the user theme */
    <div className="dark min-h-screen bg-paper text-ink">
      <header className="sticky top-0 z-40 border-b border-line bg-paper">
        <div className="mx-auto flex h-16 w-full max-w-[1400px] items-center justify-between gap-6 px-6">
          <div className="flex items-center gap-4">
            <Link href="/" className="focus-ring rounded-brand"><Logo size="md" /></Link>
            <span className="rounded-full border border-line px-2.5 py-1 text-[10px] font-medium uppercase tracking-brand text-muted">
              Super Admin
            </span>
          </div>

          <div className="hidden items-center gap-5 lg:flex">
            {[
              { name: 'Cartesia', key: 'cartesia' },
              { name: 'Twilio', key: 'twilio' },
              { name: 'Deepgram', key: 'deepgram' },
              { name: 'Supabase', key: 'supabase' },
            ].map((s) => (
              <span key={s.key} className="flex items-center gap-2 text-[12px] text-muted">
                <StatusDot tone={services[s.key] ? 'success' : 'danger'} />
                {s.name}
              </span>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden text-[12px] text-muted sm:block">RBS Labs</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-full border border-line text-[11px] font-medium text-ink">RB</span>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1400px] px-6 py-8">
        <nav className="mb-8 flex gap-6 border-b border-line">
          {TABS.map((t) => (
            <button
              key={t.id} type="button" onClick={() => setTab(t.id)}
              className={cn(
                'relative -mb-px border-b pb-3 text-[13px] font-medium transition-colors focus-ring',
                t.id === tab ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink'
              )}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {loading ? (
          <div className="flex items-center gap-3 py-20 text-[13px] text-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading tenants…
          </div>
        ) : (
          <>
            {tab === 'overview' && (
              <div className="space-y-8">
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <StatCard label="Total MRR" value={formatCurrency(stats.mrr)} delta={`${stats.total} tenants`} icon={<DollarSign className="h-4 w-4" />} />
                  <StatCard
                    label="Active Businesses"
                    value={String(stats.active)}
                    delta={duplicates ? `${stats.total} distinct · ${duplicates} duplicate row${duplicates === 1 ? '' : 's'}` : `${stats.total} total`}
                    icon={<Building2 className="h-4 w-4" />}
                  />
                  <StatCard
                    label="Total Calls"
                    value={formatNumber(stats.connectedCalls ?? stats.totalCalls)}
                    delta={`${formatNumber(stats.totalCalls)} placed · ${formatDuration(stats.answeredSeconds ?? 0)} talk time`}
                    icon={<PhoneCall className="h-4 w-4" />}
                  />
                  <StatCard label="Hot Leads" value={formatNumber(stats.hotLeads)} delta="All time" accent icon={<Flame className="h-4 w-4" />} />
                </div>

                <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
                  <TenantsTable
                    businesses={businesses}
                    duplicates={duplicates}
                    onChanged={load}
                    onNew={() => setShowNew(true)}
                  />
                  <LiveFeed calls={recent} />
                </div>
              </div>
            )}

            {tab === 'numbers' && <NumberPool businesses={businesses} onChanged={load} />}
            {tab === 'activity' && <ActivityTab calls={recent} businesses={businesses} />}
            {tab === 'billing' && <BillingTab businesses={businesses} />}
          </>
        )}
      </div>

      <NewBusinessDialog open={showNew} onClose={() => setShowNew(false)} onCreated={load} />
    </div>
  );
}

/* ── Tenants ─────────────────────────────────────────────────────── */

function TenantsTable({ businesses, duplicates, onChanged, onNew }: {
  businesses: Business[]; duplicates: number; onChanged: () => void; onNew: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [deduping, setDeduping] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const filtered = businesses.filter((b) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [b.name, b.owner_email, b.outbound_number, b.plan, b.status]
      .some((f) => String(f ?? '').toLowerCase().includes(q));
  });

  /* Which rows would be removed, so the duplicates are visible in the table
     rather than only in a total that looks wrong. */
  const duplicateIds = new Set<string>();
  const seen = new Map<string, Business>();
  for (const b of [...businesses].sort((a, c) => a.created_at.localeCompare(c.created_at) || a.id.localeCompare(c.id))) {
    const key = (b.owner_email?.trim().toLowerCase())
      || `${b.name.trim().toLowerCase()}|${(b.outbound_number ?? '').replace(/\D/g, '')}`;
    if (seen.has(key)) duplicateIds.add(b.id);
    else seen.set(key, b);
  }

  const dedupe = async () => {
    const preview = await tryApi(() => api.dedupePreview());
    if (!preview?.wouldRemove) { setNotice('No duplicates to remove.'); return; }
    if (!window.confirm(
      `Permanently delete ${preview.wouldRemove} duplicate tenant row(s)?\n\n` +
      `Call logs, campaigns and contacts are moved to the surviving business first. This cannot be undone.`
    )) return;

    setDeduping(true); setNotice(null);
    try {
      const res = await api.dedupeRun();
      setNotice(`Removed ${res.removed} duplicate row(s). ${res.remaining} business${res.remaining === 1 ? '' : 'es'} left.`);
      await onChanged();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Dedupe failed');
    } finally {
      setDeduping(false);
    }
  };

  const setStatus = async (b: Business, status: string) => {
    setBusy(b.id);
    await tryApi(() => api.updateBusiness(b.id, { status }));
    await onChanged();
    setBusy(null);
  };

  return (
    <section className="overflow-hidden rounded-brand border border-line bg-paper">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <h2 className="font-display text-[14px] font-semibold text-ink">All Tenants</h2>
          <p className="mt-0.5 text-[12px] text-muted">
            {filtered.length} of {businesses.length} shown
            {duplicates > 0 && ` · ${duplicates} duplicate row${duplicates === 1 ? '' : 's'}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, email, number"
              className="h-9 w-56 pl-8"
            />
          </div>
          {duplicates > 0 && (
            <Button variant="secondary" size="sm" className="gap-1.5" disabled={deduping} onClick={dedupe}>
              <Trash2 className="h-3.5 w-3.5" /> {deduping ? 'Merging…' : `Merge ${duplicates} duplicate${duplicates === 1 ? '' : 's'}`}
            </Button>
          )}
          <Button variant="secondary" size="sm" className="gap-1.5" onClick={onNew}>
            <Plus className="h-3.5 w-3.5" /> New business
          </Button>
        </div>
      </div>

      {notice && <p className="border-b border-line px-5 py-3 text-[12px] text-muted">{notice}</p>}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-left">
          <thead>
            <tr className="border-b border-line text-[11px] uppercase tracking-wide text-muted">
              <th className="px-5 py-3 font-medium">Business</th>
              <th className="px-5 py-3 font-medium">Number</th>
              <th className="px-5 py-3 font-medium">Plan</th>
              <th className="px-5 py-3 font-medium">Calls Used</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Created</th>
              <th className="px-5 py-3 text-right font-medium">MRR</th>
              <th className="px-5 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((b) => (
              <tr key={b.id} className="border-b border-line last:border-0 transition-colors hover:bg-surface">
                <td className="px-5 py-4">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium text-ink">{b.name}</span>
                    {duplicateIds.has(b.id) && <Badge tone="warning">duplicate</Badge>}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted">{b.owner_email ?? '—'}</div>
                </td>
                <td className="px-5 py-4 font-mono text-[12px] text-muted">{b.outbound_number ?? '—'}</td>
                <td className="px-5 py-4">
                  <Badge tone={b.plan === 'enterprise' ? 'solid' : 'default'}>
                    {b.plan[0].toUpperCase() + b.plan.slice(1)}
                  </Badge>
                </td>
                <td className="w-[200px] px-5 py-4">
                  <div className="mb-2 flex items-baseline justify-between gap-2 text-[12px]">
                    <span className="tabular-nums text-ink">{formatNumber(b.calls_used)}</span>
                    <span className="tabular-nums text-muted">/ {formatNumber(b.calls_limit)}</span>
                  </div>
                  <Progress value={b.calls_used} max={Math.max(b.calls_limit, 1)} tone="auto" />
                </td>
                <td className="px-5 py-4">
                  <Badge tone={b.status === 'active' ? 'success' : b.status === 'suspended' ? 'danger' : 'warning'}>
                    <StatusDot tone={b.status === 'active' ? 'success' : b.status === 'suspended' ? 'danger' : 'warning'} />
                    {b.status}
                  </Badge>
                </td>
                <td className="px-5 py-4 text-[12px] tabular-nums text-muted">
                  {b.created_at ? new Date(b.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}
                </td>
                <td className="px-5 py-4 text-right text-[13px] tabular-nums text-ink">
                  {b.mrr ? formatCurrency(b.mrr) : '—'}
                </td>
                <td className="px-5 py-4">
                  <div className="flex items-center justify-end gap-1.5">
                    <Link href="/admin" title="Open this dashboard">
                      <Button variant="ghost" size="sm" className="h-8 px-2"><ExternalLink className="h-3.5 w-3.5" /></Button>
                    </Link>
                    <Button
                      variant="ghost" size="sm" className="h-8 px-2"
                      disabled={busy === b.id}
                      title={b.status === 'active' ? 'Suspend' : 'Reactivate'}
                      onClick={() => void setStatus(b, b.status === 'active' ? 'suspended' : 'active')}
                    >
                      {b.status === 'active' ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ── Live feed ───────────────────────────────────────────────────── */

function LiveFeed({ calls }: { calls: CallLog[] }) {
  return (
    <section className="rounded-brand border border-line bg-paper">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <div className="flex items-center gap-2.5">
          <Activity className="h-4 w-4 text-accent" />
          <h2 className="font-display text-[14px] font-semibold text-ink">Global Call Feed</h2>
        </div>
        <span className="flex items-center gap-2 text-[11px] text-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse-dot" /> Live
        </span>
      </div>

      {calls.length === 0 ? (
        <p className="px-5 py-10 text-center text-[13px] text-muted">No calls across the platform yet.</p>
      ) : (
        <div className="divide-y divide-line">
          <AnimatePresence initial={false}>
            {calls.slice(0, 6).map((c, i) => (
              <motion.div
                key={c.id} layout
                initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                className="px-5 py-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium text-ink">{c.customer_name || 'Unknown'}</div>
                    <div className="mt-0.5 text-[11px] tabular-nums text-muted">{c.phone}</div>
                  </div>
                  <span className="shrink-0 text-[11px] tabular-nums text-muted">
                    {Math.floor(c.duration_seconds / 60)}:{String(c.duration_seconds % 60).padStart(2, '0')}
                  </span>
                </div>
                <Waveform bars={30} seed={(c.id.charCodeAt(0) * 11 + i * 7) % 200} playing={c.status === 'Connected'} height={22} className="mt-3" />
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <Badge tone={c.status === 'Hot Lead' ? 'accent' : 'default'}>{c.status}</Badge>
                  {c.vibe && <Badge>{vibeToLabel(c.vibe)}</Badge>}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </section>
  );
}

/* ── Number pool ─────────────────────────────────────────────────── */

function NumberPool({ businesses, onChanged }: { businesses: Business[]; onChanged: () => void }) {
  const [numbers, setNumbers] = useState<{ phoneNumber: string; friendlyName: string; sid: string; assignedTo: { id: string; name: string } | null }[]>([]);
  const [live, setLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [areaCode, setAreaCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await tryApi(() => api.twilioNumbers());
    if (res) { setNumbers(res.numbers); setLive(res.live); }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const buy = async (search: boolean) => {
    setBusy(true); setNotice(null);
    try {
      const res = await api.buyNumber({ areaCode: areaCode || undefined, search });
      setNotice(
        search
          ? `Available: ${(res.available ?? []).map((a) => a.phoneNumber).join(', ') || 'none'}`
          : `Bought ${res.phoneNumber}.`
      );
      if (!search) { await load(); await onChanged(); }
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Could not reach Twilio');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-brand border border-line bg-paper">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 className="font-display text-[14px] font-semibold text-ink">Twilio Number Pool</h2>
            <p className="mt-0.5 text-[12px] text-muted">
              {live ? `${numbers.length} number${numbers.length === 1 ? '' : 's'} on the account` : 'Twilio is not configured on this server'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Input value={areaCode} onChange={(e) => setAreaCode(e.target.value)} placeholder="Area code" className="h-9 w-32" />
            <Button size="sm" variant="secondary" disabled={!live || busy} onClick={() => void buy(true)}>Search</Button>
            <Button size="sm" disabled={!live || busy} onClick={() => void buy(false)}>Buy another number</Button>
          </div>
        </div>

        {notice && <p className="border-b border-line px-5 py-3 text-[12px] text-muted">{notice}</p>}

        {loading ? (
          <p className="px-5 py-10 text-center text-[13px] text-muted">Loading…</p>
        ) : numbers.length === 0 ? (
          <p className="px-5 py-10 text-center text-[13px] text-muted">
            {live ? 'No numbers on this Twilio account yet.' : 'Add Twilio credentials to manage the pool.'}
          </p>
        ) : (
          <div className="divide-y divide-line">
            {numbers.map((n) => (
              <div key={n.sid} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div>
                  <div className="font-mono text-[13px] text-ink">{n.phoneNumber}</div>
                  <div className="mt-0.5 text-[11px] text-muted">{n.friendlyName}</div>
                </div>
                <div className="flex items-center gap-3">
                  {n.assignedTo
                    ? <Badge tone="success">{n.assignedTo.name}</Badge>
                    : <Badge>Unassigned</Badge>}
                  <Select
                    className="h-9 w-52"
                    value={n.assignedTo?.id ?? ''}
                    onChange={async (e) => {
                      const id = e.target.value;
                      if (!id) return;
                      await tryApi(() => api.updateBusiness(id, { outbound_number: n.phoneNumber }));
                      await load(); await onChanged();
                    }}
                  >
                    <option value="">Assign to…</option>
                    {businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </Select>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/* ── Activity ────────────────────────────────────────────────────── */

function ActivityTab({ calls, businesses }: { calls: CallLog[]; businesses: Business[] }) {
  const nameOf = (id: string | null) => businesses.find((b) => b.id === id)?.name ?? '—';
  return (
    <section className="overflow-hidden rounded-brand border border-line bg-paper">
      <div className="border-b border-line px-5 py-4">
        <h2 className="font-display text-[14px] font-semibold text-ink">Recent Activity</h2>
        <p className="mt-0.5 text-[12px] text-muted">Calls across every business</p>
      </div>
      {calls.length === 0 ? (
        <p className="px-5 py-12 text-center text-[13px] text-muted">Nothing yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead>
              <tr className="border-b border-line text-[11px] uppercase tracking-wide text-muted">
                <th className="px-5 py-3 font-medium">Business</th>
                <th className="px-5 py-3 font-medium">Customer</th>
                <th className="px-5 py-3 font-medium">Vibe</th>
                <th className="px-5 py-3 font-medium">Duration</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {calls.map((c) => (
                <tr key={c.id} className="border-b border-line last:border-0 hover:bg-surface">
                  <td className="px-5 py-3.5 text-[13px] text-ink">{nameOf(c.business_id)}</td>
                  <td className="px-5 py-3.5">
                    <div className="text-[13px] text-ink">{c.customer_name || 'Unknown'}</div>
                    <div className="text-[11px] tabular-nums text-muted">{c.phone}</div>
                  </td>
                  <td className="px-5 py-3.5 text-[12px] text-muted">{c.vibe ? vibeToLabel(c.vibe) : '—'}</td>
                  <td className="px-5 py-3.5 text-[12px] tabular-nums text-ink">
                    {Math.floor(c.duration_seconds / 60)}:{String(c.duration_seconds % 60).padStart(2, '0')}
                  </td>
                  <td className="px-5 py-3.5"><Badge tone={c.status === 'Hot Lead' ? 'accent' : 'default'}>{c.status}</Badge></td>
                  <td className="px-5 py-3.5 text-[12px] text-muted">{new Date(c.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ── Billing ─────────────────────────────────────────────────────── */

function BillingTab({ businesses }: { businesses: Business[] }) {
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

/* ── New business ────────────────────────────────────────────────── */

function NewBusinessDialog({ open, onClose, onCreated }: {
  open: boolean; onClose: () => void; onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [plan, setPlan] = useState('starter');
  const [number, setNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true); setError(null);
    try {
      await api.createBusiness({
        name: name.trim(),
        owner_email: email.trim() || null,
        plan,
        outbound_number: number.trim() || null,
      });
      setName(''); setEmail(''); setNumber(''); setPlan('starter');
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the business');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="newbiz" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-brand border border-line bg-paper p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <h3 className="font-display text-[16px] font-semibold text-ink">New business</h3>
              <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-muted hover:text-ink focus-ring">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-6 space-y-4">
              <Field label="Business name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Marina Heights Realty" autoFocus /></Field>
              <Field label="Owner email"><Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="owner@example.com" /></Field>
              <Field label="Plan">
                <Select value={plan} onChange={(e) => setPlan(e.target.value)}>
                  <option value="starter">Starter · 500 calls</option>
                  <option value="pro">Pro · 2,000 calls</option>
                  <option value="enterprise">Enterprise · 20,000 calls</option>
                </Select>
              </Field>
              <Field label="Outbound number" hint="Assign one from the Number Pool, or leave blank for now.">
                <Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="+12232263852" />
              </Field>
            </div>

            {error && <p className="mt-4 text-[12px] text-red-500">{error}</p>}

            <div className="mt-6 flex gap-2">
              <Button size="sm" onClick={create} disabled={busy || !name.trim()}>{busy ? 'Creating…' : 'Create business'}</Button>
              <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
