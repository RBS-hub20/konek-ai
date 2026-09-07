'use client';

import { useCallback, useEffect, useState } from 'react';
import { Flame, Megaphone, Phone, Pin, PinOff, Plus, Search, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { StatCard } from '@/components/ui/StatCard';
import { Field, Input, Select } from '@/components/ui/Input';
import { PhoneInput } from '@/components/ui/PhoneInput';
import type { PhoneValue } from '@/components/ui/phoneTypes';
import { UnlockDialog } from '@/components/admin/UnlockDialog';
import { ScriptStudio } from '@/components/super-admin/ScriptStudio';
import { PowerDialer } from '@/components/super-admin/PowerDialer';
import { LeadImport } from '@/components/super-admin/LeadImport';
import { api, tryApi } from '@/lib/apiClient';
import {
  DEFAULT_VOICE_SETTINGS, type Lead, type LeadWithScript, type OutboundScript, type SalesSettings,
} from '@/lib/types2';
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
  s === 'Hot' ? 'warning'
  : s === 'Callback' ? 'accent'
  : s === 'Transferred' ? 'success'
  : s === 'Interested' ? 'accent'
  : s === 'Calling' ? 'warning'
  : s === 'Closed' ? 'success'
  : 'default';

export default function OutboundPage() {
  const [leads, setLeads] = useState<LeadWithScript[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [sales, setSales] = useState<SalesSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [showUnlock, setShowUnlock] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  /* Whatever is open in Script Studio is what the call reads — the operator
     set the call up here, so this script wins over the tenant's own. */
  const [script, setScript] = useState<OutboundScript | null>(null);
  /* Only a script the operator actually opened overrides the per-lead pick. */
  const [scriptPinned, setScriptPinned] = useState(false);

  /* The desk works a list, so it needs to cut the list down. */
  const [search, setSearch] = useState('');
  const [country, setCountry] = useState('all');
  const [industry, setIndustry] = useState('all');
  const [importing, setImporting] = useState(false);
  /* The lead currently on the phone, and the script it was dialled with. */
  const [dialing, setDialing] = useState<{ lead: Lead; script: OutboundScript | null; explicit: boolean } | null>(null);
  /* Bumped to tell Script Studio to close its open script. */
  const [unpinToken, setUnpinToken] = useState(0);
  /* Shown after a lead is added, so the answer to "which script?" arrives
     without hunting for the row. */
  const [added, setAdded] = useState<LeadWithScript | null>(null);

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
      await load();
      /* Re-read the lead so it carries the script the server resolved for it. */
      const fresh = await tryApi(() => api.leads());
      const saved = fresh?.leads.find((l) => l.id === res.leads[0]?.id) ?? null;
      setAdded(saved);
      if (!saved) setNotice(`Added ${res.leads[0]?.company ?? 'lead'} — ${res.leads[0]?.phone}.`);
    } catch (err) {
      /* Say what actually went wrong — a silent no-op is what made this look
         like the button did nothing. */
      setNotice(err instanceof Error ? err.message : 'Could not add the lead');
    } finally {
      setAdding(false);
    }
  };

  /* Dialling, listening and dispositioning all happen in one place now, so
     the button opens the dialer rather than firing a call into the dark. */
  const call = (lead: Lead) => {
    setNotice(null);
    setDialing({ lead, script: scriptPinned ? script : null, explicit: scriptPinned });
  };

  const shown = leads.filter((l) => {
    if (filter && l.status !== filter) return false;
    if (country !== 'all' && (l.country ?? '') !== country) return false;
    if (industry !== 'all' && (l.industry ?? '') !== industry) return false;
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return [l.company, l.contact_person, l.phone, l.industry, l.notes]
      .some((v) => (v ?? '').toLowerCase().includes(q));
  });

  const industries = Array.from(new Set(leads.map((l) => l.industry).filter(Boolean) as string[])).sort();
  const countries = Array.from(new Set(leads.map((l) => l.country).filter(Boolean) as string[])).sort();

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
        <StatCard
          label="Dialled today"
          value={String(stats.dialledToday ?? 0)}
          delta={`${stats.called ?? 0} ever · ${stats.dueFollowUp ?? 0} follow-up due`}
          icon={<Phone className="h-4 w-4" />}
        />
        <StatCard label="Interested" value={String(stats.interested ?? 0)} delta="Showed buying intent" accent />
        <StatCard
          label="Hot leads"
          value={String(stats.hot ?? 0)}
          delta={stats.called ? `${Math.round(((stats.hot ?? 0) / stats.called) * 100)}% of calls` : 'No calls yet'}
          icon={<Flame className="h-4 w-4" />}
        />
      </div>

      {notice && <div className="rounded-brand border border-line bg-surface p-4 text-[13px] text-muted">{notice}</div>}

      <Funnel leads={leads} active={filter} onPick={setFilter} />

      <CallingWith
        script={script}
        pinned={scriptPinned}
        onUnpin={() => { setUnpinToken((n) => n + 1); }}
      />

      {added && (
        <AddedToast lead={added} onCall={() => { call(added); setAdded(null); }} onClose={() => setAdded(null)} />
      )}

      <ScriptStudio
        onActiveScriptChange={(s, explicit) => { setScript(s); setScriptPinned(explicit); }}
        leads={leads}
        unpinToken={unpinToken}
        onCallLead={(lead, chosen) => {
          setNotice(null);
          /* Straight from the editor, so this script wins outright. */
          setDialing({ lead, script: chosen, explicit: true });
        }}
      />

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
        <div className="space-y-4 border-b border-line px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-[14px] font-semibold text-ink">Call list</h2>
              <p className="mt-0.5 text-[12px] text-muted">
                {shown.length} of {leads.length} lead{leads.length === 1 ? '' : 's'}
                {(filter || country !== 'all' || industry !== 'all' || search) && (
                  <button
                    type="button"
                    onClick={() => { setFilter(null); setCountry('all'); setIndustry('all'); setSearch(''); }}
                    className="ml-2 text-accent hover:underline"
                  >
                    clear filters
                  </button>
                )}
              </p>
            </div>
            <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => setImporting(true)}>
              <Upload className="h-3.5 w-3.5" /> Import CSV
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search business, contact, number…"
                className="h-9 pl-9"
              />
            </div>
            <Select value={country} onChange={(e) => setCountry(e.target.value)} className="h-9 w-auto">
              <option value="all">All countries</option>
              {countries.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
            <Select value={industry} onChange={(e) => setIndustry(e.target.value)} className="h-9 w-auto">
              <option value="all">All industries</option>
              {industries.map((i) => <option key={i} value={i}>{i}</option>)}
            </Select>
            <Select value={filter ?? 'all'} onChange={(e) => setFilter(e.target.value === 'all' ? null : e.target.value)} className="h-9 w-auto">
              <option value="all">All statuses</option>
              {STAGES.map((st) => <option key={st.key} value={st.key}>{st.label}</option>)}
            </Select>
          </div>
        </div>

        {loading ? (
          <p className="px-5 py-10 text-center text-[13px] text-muted">Loading…</p>
        ) : shown.length === 0 ? (
          <p className="px-5 py-12 text-center text-[13px] text-muted">
            {leads.length === 0
              ? 'No leads yet. Add one above, or import a list.'
              : 'Nothing matches these filters.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left">
              <thead>
                <tr className="border-b border-line text-[11px] uppercase tracking-wide text-muted">
                  <th className="px-5 py-3 font-medium">Company</th>
                  <th className="px-5 py-3 font-medium">Contact</th>
                  <th className="px-5 py-3 font-medium">Phone</th>
                  <th className="px-5 py-3 font-medium">Industry</th>
                  <th className="px-5 py-3 font-medium">Script</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Calls</th>
                  <th className="px-5 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((l) => (
                  <tr key={l.id} className="border-b border-line last:border-0 hover:bg-surface">
                    <td className="px-5 py-4 text-[13px] font-medium text-ink">{l.company ?? '—'}</td>
                    <td className="px-5 py-4 text-[13px] text-muted">{l.contact_person ?? '—'}</td>
                    <td className="px-5 py-4 font-mono text-[12px] text-muted">
                      {COUNTRIES.find((c) => c.code === l.country)?.label.split(' ')[0] ?? ''} {l.phone}
                    </td>
                    <td className="px-5 py-4 text-[12px] text-muted">
                      {l.industry ?? '—'}
                      {l.source && l.source !== 'manual' && (
                        <span className="ml-1.5 text-[11px] text-muted/70">· {l.source}</span>
                      )}
                    </td>
                    {/* Which script Cindy reads on this lead, resolved by the
                        same code the dialer uses. */}
                    <td className="px-5 py-4 text-[12px]">
                      {scriptPinned && script ? (
                        <span className="text-accent" title={`Pinned in Script Studio — overrides this lead's industry.`}>
                          📌 {script.name}
                        </span>
                      ) : l.resolvedScript ? (
                        <span
                          className="text-muted"
                          title={`Speed ${l.resolvedScript.speed}${l.resolvedScript.emotion ? ` · ${l.resolvedScript.emotion}` : ''}\nOpener: ${l.resolvedScript.opener}`}
                        >
                          → {l.resolvedScript.name}
                          {l.resolvedScript.reason !== 'match' && (
                            <span className="ml-1 text-muted/70">(fallback)</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-muted/70">no script</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <Badge tone={statusTone(l.status)}>{l.status === 'Hot' ? '🔥 Hot' : l.status}</Badge>
                      {l.next_follow_up_at && (
                        <div className="mt-1 text-[11px] text-muted">
                          back {new Date(l.next_follow_up_at).toLocaleDateString()}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-4 text-[12px] tabular-nums text-muted">
                      {l.call_count}
                      {l.last_called_at && (
                        <div className="text-[11px] text-muted/70">
                          {new Date(l.last_called_at).toLocaleDateString()}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm" className="gap-1.5" onClick={() => call(l)}
                          title={callTooltip(l, scriptPinned ? script : null)}
                        >
                          <Phone className="h-3.5 w-3.5" /> Call now
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

      {dialing && (
        <PowerDialer
          lead={dialing.lead}
          scriptId={dialing.explicit ? dialing.script?.id ?? null : null}
          pinnedScriptName={dialing.explicit ? dialing.script?.name ?? null : null}
          onClose={() => setDialing(null)}
          onSaved={() => { void load(); }}
        />
      )}

      {importing && (
        <LeadImport onClose={() => setImporting(false)} onImported={() => { void load(); }} />
      )}

      <UnlockDialog
        open={showUnlock}
        onClose={() => setShowUnlock(false)}
        onUnlocked={() => { setShowUnlock(false); setPending(null); }}
      />
    </div>
  );
}

/* ── Which script the next call reads ────────────────────────────── */

/* The bug this answers: the script on screen and the script the call read
   were not the same one, and nothing on the page said so. */
function CallingWith({ script, pinned, onUnpin }: {
  script: OutboundScript | null; pinned: boolean; onUnpin: () => void;
}) {
  const speed = script?.voice_settings?.speed ?? DEFAULT_VOICE_SETTINGS.speed;

  /* Nothing opened in the editor means each lead gets the best match for its
     own industry and country, which is what a mixed list needs. */
  if (!pinned) {
    return (
      <section className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-brand border border-line bg-surface px-4 py-3 text-[12px]">
        <Megaphone className="h-3.5 w-3.5 shrink-0 text-muted" />
        <span className="text-muted">Calling with:</span>
        <span className="font-medium text-ink">the best script for each lead</span>
        <span className="text-muted">
          — matched on industry and country{script ? `, default ${script.name}` : ''}. Open a script
          below to use that one for every call instead.
        </span>
      </section>
    );
  }

  return (
    <section className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-brand border border-accent/40 bg-accent/[0.05] px-4 py-3 text-[12px]">
      <Pin className="h-3.5 w-3.5 shrink-0 text-accent" />
      <span className="text-muted">Pinned — every lead is called with:</span>
      <span className="font-medium text-ink">{script?.name}</span>
      {script?.is_builtin && <Badge tone="accent">built-in</Badge>}
      {script?.country && <Badge>{script.country}</Badge>}
      <span className="tabular-nums text-muted">speed {speed}</span>
      <span className="text-muted">— this overrides each lead&rsquo;s own industry and country.</span>
      <button
        type="button"
        onClick={onUnpin}
        className="ml-auto inline-flex items-center gap-1.5 rounded-brand border border-line bg-paper px-2.5 py-1 font-medium text-ink transition-colors hover:bg-surface focus-ring"
      >
        <PinOff className="h-3 w-3" /> Unpin — go back to auto-pick
      </button>
    </section>
  );
}

/* ── Just added ──────────────────────────────────────────────────── */

/* "Which script will Cindy follow?" is the first question after adding a
   lead, so the answer arrives with the confirmation rather than being
   hunted for in the table. */
function AddedToast({ lead, onCall, onClose }: {
  lead: LeadWithScript; onCall: () => void; onClose: () => void;
}) {
  const s = lead.resolvedScript;
  return (
    <section className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-brand border border-accent/40 bg-accent/[0.05] px-4 py-3">
      <div className="min-w-0 flex-1 text-[12px]">
        <div className="font-medium text-ink">
          Added {lead.company ?? lead.phone} — {lead.phone}
        </div>
        <div className="mt-0.5 leading-relaxed text-muted">
          {s
            ? <>Will call with <span className="text-ink">{s.name}</span> — {describeReason(s.reason, lead)}, speed {s.speed}{s.emotion ? `, ${s.emotion}` : ''}.</>
            : <>No script matches this lead yet. Load the built-in scripts and Cindy has something to read.</>}
        </div>
      </div>
      <Button size="sm" className="gap-1.5" onClick={onCall}>
        <Phone className="h-3.5 w-3.5" /> Call now
      </Button>
      <button type="button" onClick={onClose} className="text-[12px] text-muted hover:text-ink focus-ring">
        Dismiss
      </button>
    </section>
  );
}

/** What the Call now button promises, before it is pressed. */
function callTooltip(lead: LeadWithScript, pinned: OutboundScript | null): string {
  if (pinned) {
    const speed = pinned.voice_settings?.speed ?? DEFAULT_VOICE_SETTINGS.speed;
    return `Will call with: ${pinned.name} (pinned — overrides this lead's industry)\nSpeed ${speed}`
      + (pinned.voice_settings?.emotion ? ` · ${pinned.voice_settings.emotion}` : '');
  }
  const s = lead.resolvedScript;
  if (!s) return 'No script matches this lead yet. Load the built-in scripts first.';
  return `Will call with: ${s.name}\nSpeed ${s.speed}${s.emotion ? ` · ${s.emotion}` : ''}\nOpener: ${s.opener}`;
}

/** Why this script, in words the operator can act on. */
function describeReason(reason: string, lead: Lead): string {
  const where = [lead.industry, lead.country].filter(Boolean).join(' ');
  switch (reason) {
    case 'match': return `auto-pick for ${where || 'this lead'}`;
    case 'country-fallback': return `no ${lead.industry ?? 'industry'} script yet, so the best ${lead.country ?? ''} one`;
    case 'any': return 'nothing matched, so the general default';
    default: return 'auto-pick';
  }
}

/* ── Funnel ──────────────────────────────────────────────────────── */

/* The stages a lead moves through, in order, so the drop-off is visible at a
   glance rather than inferred from a table. */
const STAGES: { key: string; label: string; className: string }[] = [
  { key: 'New', label: 'New', className: 'bg-line text-muted' },
  { key: 'Calling', label: 'Calling', className: 'bg-amber-500/15 text-amber-500' },
  { key: 'Interested', label: 'Interested', className: 'bg-accent/15 text-accent' },
  { key: 'Hot', label: 'Hot', className: 'bg-amber-500/20 text-amber-500' },
  { key: 'Callback', label: 'Callback', className: 'bg-accent/10 text-accent' },
  { key: 'Transferred', label: 'Transferred', className: 'bg-emerald-500/15 text-emerald-500' },
  { key: 'Closed', label: 'Closed', className: 'bg-amber-400/20 text-amber-400' },
  { key: 'Not interested', label: 'Not interested', className: 'bg-line text-muted' },
  { key: 'No answer', label: 'No answer', className: 'bg-line text-muted' },
];

function Funnel({ leads, active, onPick }: {
  leads: Lead[]; active: string | null; onPick: (s: string | null) => void;
}) {
  const total = leads.length || 1;
  return (
    <section className="rounded-brand border border-line bg-paper p-5">
      <h2 className="font-display text-[14px] font-semibold text-ink">Pipeline</h2>
      <p className="mt-0.5 text-[12px] text-muted">Click a stage to filter the table below.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {STAGES.map((s) => {
          const n = leads.filter((l) => l.status === s.key).length;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => onPick(active === s.key ? null : s.key)}
              className={cn(
                'flex min-w-[120px] flex-1 flex-col items-start gap-1 rounded-brand border px-3 py-2.5 text-left transition-colors focus-ring',
                active === s.key ? 'border-ink' : 'border-line hover:bg-surface'
              )}
            >
              <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide', s.className)}>
                {s.label}
              </span>
              <span className="font-display text-[18px] font-semibold tabular-nums text-ink">{n}</span>
              <span className="h-1 w-full rounded-full bg-line">
                <span className="block h-1 rounded-full bg-accent" style={{ width: `${(n / total) * 100}%` }} />
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
