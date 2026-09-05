'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ExternalLink, Pause, Play, Plus, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge, StatusDot } from '@/components/ui/Badge';
import { Progress } from '@/components/ui/Progress';
import { Input } from '@/components/ui/Input';
import { api, tryApi } from '@/lib/apiClient';
import { needsUnlock } from '@/lib/store';
import { UnlockDialog } from '@/components/admin/UnlockDialog';
import type { Business } from '@/lib/types2';
import { formatCurrency, formatNumber } from '@/lib/utils';

/* ── Tenants ─────────────────────────────────────────────────────── */

export function TenantsTable({ businesses, duplicates, onChanged, onNew }: {
  businesses: Business[]; duplicates: number; onChanged: () => void; onNew: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [deduping, setDeduping] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [showUnlock, setShowUnlock] = useState(false);

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

    await runDedupe();
  };

  const runDedupe = async () => {
    setDeduping(true); setNotice(null);
    try {
      const res = await api.dedupeRun();
      setNotice(`Removed ${res.removed} duplicate row(s). ${res.remaining} business${res.remaining === 1 ? '' : 'es'} left.`);
      await onChanged();
    } catch (err) {
      if (needsUnlock(err)) setShowUnlock(true);
      else setNotice(err instanceof Error ? err.message : 'Dedupe failed');
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

      <UnlockDialog open={showUnlock} onClose={() => setShowUnlock(false)} onUnlocked={runDedupe} />

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
