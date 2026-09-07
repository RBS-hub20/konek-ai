'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input, Select } from '@/components/ui/Input';
import { Info, Sparkles } from 'lucide-react';
import { api, tryApi } from '@/lib/apiClient';
import type { Business } from '@/lib/types2';

/* ── Number pool ─────────────────────────────────────────────────── */

export function NumberPool({ businesses, onChanged }: { businesses: Business[]; onChanged: () => void }) {
  const hasSalesTenant = businesses.some((b) => b.sales_tenant);
  const [numbers, setNumbers] = useState<{ phoneNumber: string; friendlyName: string; sid: string; assignedTo: { id: string; name: string } | null }[]>([]);
  const [live, setLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [areaCode, setAreaCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  /* Which number is having a sales tenant created for it. */
  const [creating, setCreating] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await tryApi(() => api.twilioNumbers());
    if (res) { setNumbers(res.numbers); setLive(res.live); }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  /* The pool could only assign to a tenant that already existed, and the
     tenant people wanted to assign to was the one they could not create. */
  const createSalesTenant = async (number: string) => {
    setCreating(number); setNotice(null);
    try {
      const res = await api.createSalesTenant({ number });
      setNotice(
        `${res.salesTenant.name} created and ${number} assigned.` +
        (res.webhook
          ? ' Callbacks to this number now reach the sales closer.'
          : res.webhookError
            ? ` The tenant is set up, but the inbound webhook did not stick: ${res.webhookError}`
            : '')
      );
      await load(); await onChanged();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Could not create the sales tenant');
    } finally {
      setCreating(null);
    }
  };

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
                <div className="flex flex-wrap items-center gap-3">
                  {n.assignedTo
                    ? <Badge tone="success">{n.assignedTo.name}</Badge>
                    : <Badge>Unassigned</Badge>}
                  {businesses.find((b) => b.id === n.assignedTo?.id)?.sales_tenant && (
                    <Badge tone="accent">sales line</Badge>
                  )}
                  <Select
                    className="h-9 w-52"
                    value={n.assignedTo?.id ?? ''}
                    onChange={async (e) => {
                      const id = e.target.value;
                      if (id === '__sales__') { void createSalesTenant(n.phoneNumber); return; }
                      if (!id) return;
                      await tryApi(() => api.updateBusiness(id, { outbound_number: n.phoneNumber }));
                      await load(); await onChanged();
                    }}
                  >
                    <option value="">Assign to…</option>
                    {businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    {!hasSalesTenant && <option value="__sales__">+ Create the KONEK AI sales tenant</option>}
                  </Select>
                  {!n.assignedTo && !hasSalesTenant && (
                    <Button
                      size="sm" variant="secondary" className="gap-1.5"
                      disabled={creating === n.phoneNumber}
                      onClick={() => void createSalesTenant(n.phoneNumber)}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      {creating === n.phoneNumber ? 'Creating…' : 'Make this the KONEK AI sales line'}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        {/* Why the pool is all +1 numbers. */}
        <div className="flex items-start gap-2.5 border-t border-line px-5 py-4">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" />
          <p className="text-[12px] leading-relaxed text-muted">
            Only US numbers show here because this Twilio account is US-registered. To buy a
            Philippine <span className="text-ink">+63</span> number, enable it in the Twilio console
            under <span className="text-ink">Phone Numbers → Regulatory Compliance → International</span>,
            or buy it in the console with a PH address on file. PH numbers usually need a local
            address and an ID document before Twilio will sell one. A local caller id is worth the
            paperwork: a Philippine mobile ignores a +1 number far more often than it ignores a +63 one.
          </p>
        </div>
      </section>
    </div>
  );
}
