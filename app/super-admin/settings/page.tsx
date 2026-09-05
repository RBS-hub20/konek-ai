'use client';

import { AlertTriangle, Check, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useSuperAdmin } from '@/components/super-admin/SuperAdminData';

/* The one screen that answers "why is that field empty?" */
export default function SchemaHealthPage() {
  const { schema, services, loading, reload } = useSuperAdmin();

  if (loading) return <p className="py-20 text-[13px] text-muted">Checking…</p>;

  const healthy = schema?.healthy === true;
  /* "Not connected" and "connected but incomplete" are different problems and
     must not read the same. */
  const disconnected = schema?.connected === false;
  const tables = (schema?.tables ?? {}) as Record<
    string,
    { exists: boolean; rows?: string | number; columns?: number | null; missing?: string[]; error?: string; note?: string }
  >;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[22px] font-semibold tracking-tight text-ink">Schema Health</h1>
          <p className="mt-1.5 text-[13px] text-muted">
            What the database actually has, against what the app writes.
          </p>
        </div>
        <Button variant="secondary" size="sm" className="gap-1.5" onClick={() => void reload()}>
          <RefreshCw className="h-3.5 w-3.5" /> Re-check
        </Button>
      </div>

      <section className={`rounded-brand border p-5 ${healthy ? 'border-line' : 'border-amber-500/40'} bg-paper`}>
        <div className="flex items-center gap-2">
          {healthy
            ? <Check className="h-4 w-4 text-emerald-500" />
            : <AlertTriangle className="h-4 w-4 text-amber-500" />}
          <span className="font-display text-[14px] font-semibold text-ink">
            {healthy
              ? 'Everything the app writes exists'
              : disconnected
                ? 'No database connected'
                : 'Some columns and tables are missing'}
          </span>
        </div>

        {disconnected && (
          <p className="mt-3 text-[13px] leading-relaxed text-muted">
            Running on the in-process store, so nothing here is persisted. Set the Supabase environment
            variables to connect one.
          </p>
        )}

        {!healthy && !disconnected && (
          <>
            <p className="mt-3 text-[13px] leading-relaxed text-muted">
              Writes drop columns the table does not have, so calls keep working and the gap stays invisible.
              These are the consequences you are seeing:
            </p>
            <ul className="mt-3 space-y-1.5 text-[12.5px] text-muted">
              {schema?.missingColumns?.includes('call_logs.twilio_sid') && (
                <li>· <span className="text-ink">call_logs.twilio_sid</span> — Twilio&apos;s status callback has no way to
                  find the call it should write the duration to, so every call reads 0:00.</li>
              )}
              {schema?.missingColumns?.includes('call_logs.phone') && (
                <li>· <span className="text-ink">call_logs.phone</span> — the customer number is dropped on insert, so the
                  Phone column shows “—”.</li>
              )}
              {schema?.missingColumns?.includes('call_logs.language') && (
                <li>· <span className="text-ink">call_logs.language</span> — the detected language cannot be saved, so the
                  language flags and breakdown stay empty.</li>
              )}
              {schema?.missingColumns?.some((c) => c.startsWith('businesses.')) && (
                <li>· <span className="text-ink">businesses.*</span> — vibe, language and the auto-detect toggle do not
                  survive a reload.</li>
              )}
            </ul>
            <p className="mt-4 rounded-brand bg-surface p-3 text-[12px] leading-relaxed text-muted">
              Fix: paste <span className="font-mono text-ink">supabase.sql</span> into the Supabase SQL Editor and run it.
              It is additive, safe to re-run, and ends with <span className="font-mono text-ink">NOTIFY pgrst</span> so the
              schema cache reloads immediately.
            </p>
          </>
        )}
      </section>

      <section className="overflow-hidden rounded-brand border border-line bg-paper">
        <div className="border-b border-line px-5 py-4">
          <h2 className="font-display text-[14px] font-semibold text-ink">Tables</h2>
        </div>
        {Object.keys(tables).length === 0 && (
          <p className="px-5 py-8 text-center text-[13px] text-muted">
            Nothing to inspect without a database connection.
          </p>
        )}
        <div className="divide-y divide-line">
          {Object.entries(tables).map(([name, t]) => (
            <div key={name} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
              <div className="min-w-0">
                <div className="font-mono text-[13px] text-ink">{name}</div>
                {t.note && <div className="mt-0.5 text-[11px] text-muted">{t.note}</div>}
                {t.error && <div className="mt-0.5 text-[11px] text-muted">{t.error}</div>}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {!t.exists && <Badge tone="danger">missing</Badge>}
                {t.exists && !t.missing?.length && <Badge tone="success">ok</Badge>}
                {t.missing?.map((c) => <Badge key={c} tone="warning">{c}</Badge>)}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-brand border border-line bg-paper p-5">
        <h2 className="font-display text-[14px] font-semibold text-ink">Services</h2>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(services).map(([k, v]) => (
            <div key={k} className="flex items-center justify-between rounded-brand border border-line px-3 py-2 text-[12px]">
              <span className="text-muted">{k}</span>
              <Badge tone={v ? 'success' : 'default'}>{v ? 'live' : 'missing'}</Badge>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
