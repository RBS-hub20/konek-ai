'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge, StatusDot } from '@/components/ui/Badge';
import { api, tryApi } from '@/lib/apiClient';
import { useKonekStore } from '@/lib/store';

type Row = {
  name: string; category: string; detail: string;
  connected: boolean; managedByEnv: boolean; meta: Record<string, unknown>;
};

export function IntegrationsTab() {
  const businessId = useKonekStore((s) => s.businessId);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await tryApi(() => api.integrations(businessId ?? undefined));
    if (res) setRows(res.integrations);
  }, [businessId]);

  useEffect(() => { void load(); }, [load]);

  const toggle = async (row: Row) => {
    setBusy(row.name); setNotice(null);
    try {
      await api.setIntegration(row.name, !row.connected, businessId ?? undefined);
      await load();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Could not update');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-7">
      <div>
        <h1 className="font-display text-[22px] font-semibold tracking-tight text-ink">Integrations</h1>
        <p className="mt-1.5 text-[13px] text-muted">Connect the tools your business already runs on.</p>
      </div>

      {notice && <div className="rounded-brand border border-line bg-surface p-4 text-[13px] text-muted">{notice}</div>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((i) => (
          <section key={i.name} className="flex flex-col rounded-brand border border-line bg-paper p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-[14px] font-semibold text-ink">{i.name}</h2>
                <p className="mt-0.5 text-[11px] text-muted">{i.category}</p>
              </div>
              {i.connected && <Badge tone="success"><StatusDot tone="success" /> Connected</Badge>}
            </div>

            <p className="mt-4 flex-1 text-[12.5px] leading-relaxed text-muted">{i.detail}</p>

            {typeof i.meta?.number === 'string' && (
              <p className="mt-3 font-mono text-[12px] text-ink">{i.meta.number}</p>
            )}

            {i.managedByEnv ? (
              <p className="mt-5 text-[11px] leading-relaxed text-muted">
                {i.connected
                  ? 'Configured with server environment variables.'
                  : 'Add its API key in Vercel and redeploy to connect.'}
              </p>
            ) : (
              <Button
                variant={i.connected ? 'secondary' : 'primary'}
                size="sm"
                className="mt-5 w-full"
                disabled={busy === i.name}
                onClick={() => void toggle(i)}
              >
                {busy === i.name ? '…' : i.connected ? 'Disconnect' : 'Connect'}
              </Button>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
