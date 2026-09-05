'use client';

import { useCallback, useEffect, useState } from 'react';
import { Megaphone, Phone, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { StatCard } from '@/components/ui/StatCard';
import { Field, Input, Select } from '@/components/ui/Input';
import { PhoneInput } from '@/components/ui/PhoneInput';
import type { PhoneValue } from '@/components/ui/phoneTypes';
import { UnlockDialog } from '@/components/admin/UnlockDialog';
import { api, tryApi } from '@/lib/apiClient';
import { needsUnlock } from '@/lib/store';
import type { Lead, SalesSettings } from '@/lib/types2';
import { cn } from '@/lib/utils';

const INDUSTRIES = [
  'Laundry', 'Salon', 'Clinic', 'Restaurant', 'Cafe', 'Gym',
  'Auto Shop', 'Real Estate', 'Retail', 'Other',
];

const COUNTRIES = [
  { code: 'PH', label: '🇵🇭 Philippines', dial: '+63' },
  { code: 'AE', label: '🇦🇪 UAE', dial: '+971' },
  { code: 'SA', label: '🇸🇦 Saudi Arabia', dial: '+966' },
  { code: 'SG', label: '🇸🇬 Singapore', dial: '+65' },
  { code: 'US', label: '🇺🇸 United States', dial: '+1' },
];

const statusTone = (s: string) =>
  s === 'Transferred' ? 'success'
  : s === 'Interested' ? 'accent'
  : s === 'Calling' ? 'warning'
  : s === 'Closed' ? 'success'
  : 'default';

export default function OutboundPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [sales, setSales] = useState<SalesSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [calling, setCalling] = useState<string | null>(null);
  const [showUnlock, setShowUnlock] = useState(false);
  const [pending, setPending] = useState<string | null>(null);

  const [form, setForm] = useState({ company: '', contact_person: '', industry: 'Laundry' });
  /* Same component the test-call dialog uses, so the number is already E.164
     before it leaves the browser. */
  const [phone, setPhone] = useState<PhoneValue>({ e164: null, country: 'PH', valid: false });
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const [res, s] = await Promise.all([tryApi(() => api.leads()), tryApi(() => api.salesSettings())]);
    if (res) { setLeads(res.leads); setStats(res.stats); }
    if (s) setSales(s.sales);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const addLead = async () => {
    if (!form.company.trim() || !phone.valid || !phone.e164) return;
    setAdding(true); setNotice(null);
    try {
      const res = await api.addLead({
        company: form.company.trim(),
        contact_person: form.contact_person.trim() || null,
        industry: form.industry,
        phone: phone.e164,
        country: phone.country,
      });
      setForm({ company: '', contact_person: '', industry: form.industry });
      setPhone({ e164: null, country: phone.country, valid: false });
      setNotice(`Added ${res.leads[0]?.company ?? 'lead'} — ${res.leads[0]?.phone}.`);
      await load();
    } catch (err) {
      /* Say what actually went wrong — a silent no-op is what made this look
         like the button did nothing. */
      setNotice(err instanceof Error ? err.message : 'Could not add the lead');
    } finally {
      setAdding(false);
    }
  };

  const call = async (id: string) => {
    setCalling(id); setNotice(null);
    try {
      const res = await api.callLead(id);
      setNotice(res.warning ?? `Cindy is calling ${res.to} in ${res.language}.`);
      await load();
    } catch (err) {
      if (needsUnlock(err)) { setPending(id); setShowUnlock(true); }
      else setNotice(err instanceof Error ? err.message : 'Call failed');
    } finally {
      setCalling(null);
    }
  };

  const ready = Boolean(sales?.manager_number);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-brand border border-line">
            <Megaphone className="h-4 w-4 text-ink" />
          </span>
          <div>
            <h1 className="font-display text-[18px] font-semibold tracking-tight text-ink">Cindy AI — Outbound Sales</h1>
            <p className="mt-0.5 text-[12px] text-muted">
              Cindy calls the lead. The moment they show interest, the call goes to a human to close.
            </p>
          </div>
        </div>
      </div>

      {!ready && (
        <div className="rounded-brand border border-amber-500/40 bg-surface p-4">
          <div className="text-[13px] font-medium text-ink">No sales manager number set</div>
          <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
            Cindy can still call, but an interested lead has nobody to be transferred to. Set it in
            Schema Health → Sales numbers.
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Leads" value={String(stats.total ?? 0)} delta={`${stats.new ?? 0} not yet called`} />
        <StatCard label="Called" value={String(stats.called ?? 0)} delta="Cindy has dialled" icon={<Phone className="h-4 w-4" />} />
        <StatCard label="Interested" value={String(stats.interested ?? 0)} delta="Showed buying intent" accent />
        <StatCard
          label="Transferred"
          value={String(stats.transferred ?? 0)}
          delta={stats.called ? `${Math.round(((stats.transferred ?? 0) / stats.called) * 100)}% of calls` : 'No calls yet'}
        />
      </div>

      {notice && <div className="rounded-brand border border-line bg-surface p-4 text-[13px] text-muted">{notice}</div>}

      {/* Add lead */}
      <section className="rounded-brand border border-line bg-paper p-5">
        <h2 className="font-display text-[14px] font-semibold text-ink">Add a lead</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-4">
          <Field label="Company"><Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Bubbles Laundry" /></Field>
          <Field label="Contact person"><Input value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} placeholder="Maria" /></Field>
          <Field
            label="Phone"
            hint={phone.e164 && !phone.valid ? 'Not valid for this country yet.' : 'Pick the country, then type it as they would locally.'}
          >
            <PhoneInput value={phone} onChange={setPhone} onEnter={addLead} />
          </Field>
          <Field label="Industry">
            <Select value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })}>
              {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
            </Select>
          </Field>
        </div>
        {phone.valid && phone.e164 && (
          <p className="mt-3 text-[12px] text-muted">
            Cindy will dial <span className="tabular-nums text-ink">{phone.e164}</span>
          </p>
        )}
        <Button size="sm" className="mt-4 gap-1.5" onClick={addLead} disabled={adding || !form.company.trim() || !phone.valid}>
          <Plus className="h-3.5 w-3.5" /> {adding ? 'Adding…' : 'Add lead'}
        </Button>
      </section>

      {/* Pipeline */}
      <section className="overflow-hidden rounded-brand border border-line bg-paper">
        <div className="border-b border-line px-5 py-4">
          <h2 className="font-display text-[14px] font-semibold text-ink">Pipeline</h2>
          <p className="mt-0.5 text-[12px] text-muted">{leads.length} lead{leads.length === 1 ? '' : 's'}</p>
        </div>

        {loading ? (
          <p className="px-5 py-10 text-center text-[13px] text-muted">Loading…</p>
        ) : leads.length === 0 ? (
          <p className="px-5 py-12 text-center text-[13px] text-muted">No leads yet. Add one above and press Call.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left">
              <thead>
                <tr className="border-b border-line text-[11px] uppercase tracking-wide text-muted">
                  <th className="px-5 py-3 font-medium">Company</th>
                  <th className="px-5 py-3 font-medium">Contact</th>
                  <th className="px-5 py-3 font-medium">Phone</th>
                  <th className="px-5 py-3 font-medium">Industry</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Calls</th>
                  <th className="px-5 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.id} className="border-b border-line last:border-0 hover:bg-surface">
                    <td className="px-5 py-4 text-[13px] font-medium text-ink">{l.company ?? '—'}</td>
                    <td className="px-5 py-4 text-[13px] text-muted">{l.contact_person ?? '—'}</td>
                    <td className="px-5 py-4 font-mono text-[12px] text-muted">
                      {COUNTRIES.find((c) => c.code === l.country)?.label.split(' ')[0] ?? ''} {l.phone}
                    </td>
                    <td className="px-5 py-4 text-[12px] text-muted">{l.industry ?? '—'}</td>
                    <td className="px-5 py-4"><Badge tone={statusTone(l.status)}>{l.status}</Badge></td>
                    <td className="px-5 py-4 text-[12px] tabular-nums text-muted">{l.call_count}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <Button size="sm" disabled={calling === l.id} onClick={() => void call(l.id)} className={cn(calling === l.id && 'opacity-60')}>
                          {calling === l.id ? 'Calling…' : 'Call'}
                        </Button>
                        <button
                          type="button" aria-label={`Delete ${l.company}`}
                          onClick={async () => { await api.deleteLead(l.id); await load(); }}
                          className="rounded p-1.5 text-muted transition-colors hover:text-red-500 focus-ring"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <UnlockDialog
        open={showUnlock}
        onClose={() => setShowUnlock(false)}
        onUnlocked={() => { if (pending) void call(pending); setPending(null); }}
      />
    </div>
  );
}
