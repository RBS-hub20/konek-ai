'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  CreditCard,
  DollarSign,
  ExternalLink,
  Flame,
  MoreHorizontal,
  Pause,
  PhoneCall,
  Building2,
} from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import { Button } from '@/components/ui/Button';
import { Badge, StatusDot } from '@/components/ui/Badge';
import { Progress } from '@/components/ui/Progress';
import { StatCard } from '@/components/ui/StatCard';
import { Waveform } from '@/components/ui/Waveform';
import {
  LIVE_FEED_SEED,
  PLATFORM_STATS,
  READY_MADE_SKILLS,
  TENANTS,
  type Tenant,
} from '@/lib/mockData';
import { api, tryApi } from '@/lib/apiClient';
import type { BusinessRow } from '@/lib/types';
import { cn, formatCurrency, formatNumber } from '@/lib/utils';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'skills', label: 'Skills Analytics' },
  { id: 'billing', label: 'Billing' },
  { id: 'logs', label: 'Logs' },
] as const;
type TabId = (typeof TABS)[number]['id'];

const SERVICES = [
  { name: 'Cartesia', detail: 'Voice synthesis' },
  { name: 'Twilio', detail: 'Telephony' },
  { name: 'Deepgram', detail: 'Transcription' },
];

function statusTone(status: Tenant['status']) {
  return status === 'Active'
    ? 'success'
    : status === 'Trial'
      ? 'accent'
      : status === 'Past Due'
        ? 'danger'
        : 'default';
}

/* Real tenants from /api/business, falling back to the sample roster so the
   console is never empty before a database is connected. */
function toTenant(b: BusinessRow): Tenant {
  const plan = (b.plan ?? 'starter') as string;
  return {
    id: b.id,
    business: b.name,
    owner: b.owner_name ?? '—',
    email: b.owner_email,
    plan: (plan.charAt(0).toUpperCase() + plan.slice(1)) as Tenant['plan'],
    used: b.calls_used ?? 0,
    limit: b.calls_limit || 1,
    status: ((b.status ?? 'active').charAt(0).toUpperCase() + (b.status ?? 'active').slice(1)) as Tenant['status'],
    mrr: b.mrr ?? 0,
    country: '—',
  };
}

function useTenants() {
  const [tenants, setTenants] = useState<Tenant[]>(TENANTS);
  const [stats, setStats] = useState({
    mrr: PLATFORM_STATS.mrr,
    active: PLATFORM_STATS.activeBusinesses,
    total: TENANTS.length,
    callsUsed: PLATFORM_STATS.callsToday,
  });
  const [live, setLive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await tryApi(() => api.allBusinesses());
      if (cancelled || !res?.businesses.length) return;
      setTenants(res.businesses.map(toTenant));
      setStats(res.stats);
      setLive(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { tenants, stats, live };
}

export default function SuperAdminPage() {
  const [tab, setTab] = useState<TabId>('overview');
  const { tenants, stats, live } = useTenants();

  return (
    /* RBS Labs console — dark by default, independent of the user theme */
    <div className="dark min-h-screen bg-paper text-ink">
      {/* ── Top bar ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-line bg-paper">
        <div className="mx-auto flex h-16 w-full max-w-[1400px] items-center justify-between gap-6 px-6">
          <div className="flex items-center gap-4">
            <Link href="/" className="focus-ring rounded-brand">
              <Logo size="md" />
            </Link>
            <span className="rounded-full border border-line px-2.5 py-1 text-[10px] font-medium uppercase tracking-brand text-muted">
              Super Admin
            </span>
          </div>

          <div className="hidden items-center gap-5 lg:flex">
            {SERVICES.map((s) => (
              <span key={s.name} className="flex items-center gap-2 text-[12px] text-muted" title={s.detail}>
                <StatusDot tone="success" />
                {s.name}
              </span>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden text-[12px] text-muted sm:block">RBS Labs</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-full border border-line text-[11px] font-medium text-ink">
              RB
            </span>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1400px] px-6 py-8">
        {/* Mobile system health */}
        <div className="mb-6 flex items-center gap-5 lg:hidden">
          {SERVICES.map((s) => (
            <span key={s.name} className="flex items-center gap-2 text-[12px] text-muted">
              <StatusDot tone="success" />
              {s.name}
            </span>
          ))}
        </div>

        {/* ── Tabs ──────────────────────────────────────────────── */}
        <nav className="mb-8 flex gap-6 border-b border-line">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'relative -mb-px border-b pb-3 text-[13px] font-medium transition-colors focus-ring',
                t.id === tab ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink'
              )}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {tab === 'overview' && <OverviewTab tenants={tenants} stats={stats} live={live} />}
        {tab === 'skills' && <SkillsAnalyticsTab />}
        {tab === 'billing' && <BillingTab tenants={tenants} />}
        {tab === 'logs' && <LogsTab />}
      </div>
    </div>
  );
}

/* ── Overview ───────────────────────────────────────────────────── */

interface TenantData {
  tenants: Tenant[];
  stats: { mrr: number; active: number; total: number; callsUsed: number };
  live: boolean;
}

function OverviewTab({ tenants, stats, live }: TenantData) {
  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total MRR" value={formatCurrency(stats.mrr)} delta={live ? 'From the database' : '+18.4% vs last month'} icon={<DollarSign className="h-4 w-4" />} />
        <StatCard label="Active Businesses" value={String(stats.active)} delta={`${stats.total} total tenants`} icon={<Building2 className="h-4 w-4" />} />
        <StatCard label="Calls Today" value={formatNumber(live ? stats.callsUsed : PLATFORM_STATS.callsToday)} delta="Across all businesses" icon={<PhoneCall className="h-4 w-4" />} />
        <StatCard label="Hot Leads" value={formatNumber(PLATFORM_STATS.hotLeads)} delta="6.5% of all calls" accent icon={<Flame className="h-4 w-4" />} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <TenantsTable tenants={tenants} live={live} />
        <LiveGlobalFeed />
      </div>
    </div>
  );
}

function TenantsTable({ tenants, live }: { tenants: Tenant[]; live: boolean }) {
  return (
    <section className="overflow-hidden rounded-brand border border-line bg-paper">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <div>
          <h2 className="font-display text-[14px] font-semibold text-ink">All Tenants</h2>
          <p className="mt-0.5 text-[12px] text-muted">
            Every business running on KONEK AI{live ? '' : ' · sample data'}
          </p>
        </div>
        <Button variant="secondary" size="sm">Export</Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] text-left">
          <thead>
            <tr className="border-b border-line text-[11px] uppercase tracking-wide text-muted">
              <th className="px-5 py-3 font-medium">Business</th>
              <th className="px-5 py-3 font-medium">Owner</th>
              <th className="px-5 py-3 font-medium">Plan</th>
              <th className="px-5 py-3 font-medium">Calls Used</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 text-right font-medium">MRR</th>
              <th className="px-5 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((t) => (
              <tr key={t.id} className="border-b border-line last:border-0 transition-colors hover:bg-surface">
                <td className="px-5 py-4">
                  <div className="text-[13px] font-medium text-ink">{t.business}</div>
                  <div className="mt-0.5 text-[11px] text-muted">{t.country}</div>
                </td>
                <td className="px-5 py-4">
                  <div className="text-[13px] text-ink">{t.owner}</div>
                  <div className="mt-0.5 text-[11px] text-muted">{t.email}</div>
                </td>
                <td className="px-5 py-4">
                  <Badge tone={t.plan === 'Enterprise' ? 'solid' : 'default'}>{t.plan}</Badge>
                </td>
                <td className="w-[200px] px-5 py-4">
                  <div className="mb-2 flex items-baseline justify-between gap-2 text-[12px]">
                    <span className="tabular-nums text-ink">{formatNumber(t.used)}</span>
                    <span className="tabular-nums text-muted">/ {formatNumber(t.limit)}</span>
                  </div>
                  <Progress value={t.used} max={t.limit} tone="auto" />
                </td>
                <td className="px-5 py-4">
                  <Badge tone={statusTone(t.status)}>
                    <StatusDot
                      tone={t.status === 'Active' ? 'success' : t.status === 'Past Due' ? 'danger' : 'warning'}
                    />
                    {t.status}
                  </Badge>
                </td>
                <td className="px-5 py-4 text-right text-[13px] tabular-nums text-ink">
                  {t.mrr ? formatCurrency(t.mrr) : '—'}
                </td>
                <td className="px-5 py-4">
                  <div className="flex items-center justify-end gap-1.5">
                    <Button variant="ghost" size="sm" className="h-8 px-2" title="View">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8 px-2" title="Pause">
                      <Pause className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8 px-2" title="Billing">
                      <CreditCard className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8 px-2" title="More">
                      <MoreHorizontal className="h-3.5 w-3.5" />
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

interface FeedItem {
  key: string;
  business: string;
  customer: string;
  skill: string;
  vibe: string;
  seed: number;
  secs: number;
}

function LiveGlobalFeed() {
  const initial = useMemo<FeedItem[]>(
    () =>
      LIVE_FEED_SEED.slice(0, 5).map((c, i) => ({
        ...c,
        key: `seed-${i}`,
        seed: 13 + i * 17,
        secs: 12 + i * 9,
      })),
    []
  );
  const [items, setItems] = useState<FeedItem[]>(initial);

  /* New calls land at the top, oldest drops off — mounted-only so SSR stays stable */
  useEffect(() => {
    let n = 0;
    const id = setInterval(() => {
      n += 1;
      const src = LIVE_FEED_SEED[n % LIVE_FEED_SEED.length];
      setItems((prev) => [
        { ...src, key: `live-${n}`, seed: (n * 37) % 200, secs: 1 },
        ...prev.slice(0, 4),
      ]);
    }, 3800);
    return () => clearInterval(id);
  }, []);

  /* Tick the durations of the visible calls */
  useEffect(() => {
    const id = setInterval(() => {
      setItems((prev) => prev.map((i) => ({ ...i, secs: i.secs + 1 })));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <section className="rounded-brand border border-line bg-paper">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <div className="flex items-center gap-2.5">
          <Activity className="h-4 w-4 text-accent" />
          <h2 className="font-display text-[14px] font-semibold text-ink">Live Global Call Feed</h2>
        </div>
        <span className="flex items-center gap-2 text-[11px] text-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse-dot" />
          Live
        </span>
      </div>

      <div className="divide-y divide-line">
        <AnimatePresence initial={false}>
          {items.map((c) => (
            <motion.div
              key={c.key}
              layout
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              className="px-5 py-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-medium text-ink">{c.business}</div>
                  <div className="mt-0.5 text-[11px] tabular-nums text-muted">{c.customer}</div>
                </div>
                <span className="shrink-0 text-[11px] tabular-nums text-muted">
                  {Math.floor(c.secs / 60)}:{String(c.secs % 60).padStart(2, '0')}
                </span>
              </div>
              <Waveform bars={30} seed={c.seed} playing height={22} className="mt-3" />
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <Badge tone="accent">{c.skill}</Badge>
                <Badge>{c.vibe}</Badge>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </section>
  );
}

/* ── Skills Analytics ───────────────────────────────────────────── */

function SkillsAnalyticsTab() {
  const ranked = [...READY_MADE_SKILLS].sort((a, b) => b.adoption - a.adoption);
  const totalCalls = READY_MADE_SKILLS.reduce((s, k) => s + k.callsRun, 0);

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Skill Activations" value={formatNumber(totalCalls)} delta="Calls run through a skill" />
        <StatCard label="Most Used" value={ranked[0].name.replace(' Skill', '')} delta={`${Math.round(ranked[0].adoption * 100)}% of businesses`} accent />
        <StatCard label="Custom Skills Built" value="3,418" delta="+412 this month" />
      </div>

      <section className="rounded-brand border border-line bg-paper">
        <div className="border-b border-line px-5 py-4">
          <h2 className="font-display text-[14px] font-semibold text-ink">Skill Adoption Across All Businesses</h2>
          <p className="mt-0.5 text-[12px] text-muted">Which ready-made skills tenants actually switch on</p>
        </div>
        <div className="divide-y divide-line">
          {ranked.map((s) => (
            <div key={s.id} className="flex items-center gap-5 px-5 py-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-brand border border-line">
                <s.icon className="h-4 w-4 text-ink" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-[13px] font-medium text-ink">{s.name}</span>
                  <span className="shrink-0 text-[12px] tabular-nums text-muted">
                    {formatNumber(s.callsRun)} calls
                  </span>
                </div>
                <div className="mt-2.5 flex items-center gap-3">
                  <Progress value={s.adoption * 100} tone="accent" className="flex-1" />
                  <span className="w-10 shrink-0 text-right text-[12px] tabular-nums text-ink">
                    {Math.round(s.adoption * 100)}%
                  </span>
                </div>
              </div>
              <Badge className="hidden shrink-0 sm:inline-flex">{s.category}</Badge>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/* ── Billing ────────────────────────────────────────────────────── */

function BillingTab({ tenants }: { tenants: Tenant[] }) {
  const byPlan = ['Starter', 'Pro', 'Enterprise'].map((plan) => {
    const rows = tenants.filter((t) => t.plan === plan);
    return { plan, count: rows.length, mrr: rows.reduce((s, t) => s + t.mrr, 0) };
  });

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-3">
        {byPlan.map((p) => (
          <StatCard key={p.plan} label={`${p.plan} MRR`} value={formatCurrency(p.mrr)} delta={`${p.count} businesses`} />
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
              {tenants.filter((t) => t.mrr > 0).map((t) => (
                <tr key={t.id} className="border-b border-line last:border-0 hover:bg-surface">
                  <td className="px-5 py-4 text-[13px] text-ink">{t.business}</td>
                  <td className="px-5 py-4"><Badge>{t.plan}</Badge></td>
                  <td className="px-5 py-4">
                    <Badge tone={t.status === 'Past Due' ? 'danger' : 'success'}>
                      {t.status === 'Past Due' ? 'Past Due' : 'Paid'}
                    </Badge>
                  </td>
                  <td className="px-5 py-4 text-right text-[13px] tabular-nums text-ink">
                    {formatCurrency(t.mrr)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/* ── Logs ───────────────────────────────────────────────────────── */

const SYSTEM_LOGS = [
  { t: '18:42:07', level: 'info', msg: 'cartesia.sonic · voice stream established', ctx: 'Marina Heights Realty' },
  { t: '18:41:55', level: 'info', msg: 'twilio · outbound call connected +971 50 ••• 4402', ctx: 'Marina Heights Realty' },
  { t: '18:41:12', level: 'warn', msg: 'tenant approaching call limit (99.5%)', ctx: 'Lumina Dental' },
  { t: '18:40:38', level: 'info', msg: 'skill.booking · calendar slot written', ctx: 'Nova Aesthetics' },
  { t: '18:39:02', level: 'error', msg: 'stripe · payment failed, retrying in 24h', ctx: 'Glow Studio Cebu' },
  { t: '18:38:44', level: 'info', msg: 'deepgram · transcript finalized 3.2s latency', ctx: 'Vertex FX' },
  { t: '18:37:19', level: 'info', msg: 'skill.custom · "Dubai Delivery Objection" fired', ctx: 'Marina Heights Realty' },
  { t: '18:36:51', level: 'info', msg: 'tenant provisioned · number +63 917 ••• 8642', ctx: 'Casa Verde Realty' },
];

function LogsTab() {
  return (
    <section className="overflow-hidden rounded-brand border border-line bg-paper">
      <div className="border-b border-line px-5 py-4">
        <h2 className="font-display text-[14px] font-semibold text-ink">System Logs</h2>
        <p className="mt-0.5 text-[12px] text-muted">Platform events across every tenant</p>
      </div>
      <div className="divide-y divide-line font-mono text-[12px]">
        {SYSTEM_LOGS.map((l, i) => (
          <div key={i} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
            <span className="tabular-nums text-muted">{l.t}</span>
            <span
              className={cn(
                'w-12 shrink-0 uppercase',
                l.level === 'error' ? 'text-red-400' : l.level === 'warn' ? 'text-amber-400' : 'text-emerald-400'
              )}
            >
              {l.level}
            </span>
            <span className="flex-1 text-ink">{l.msg}</span>
            <span className="text-muted">{l.ctx}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
