'use client';

import { Badge } from '@/components/ui/Badge';
import type { Business, CallLog } from '@/lib/types2';
import { vibeToLabel } from '@/lib/types2';
import { LANGUAGES, languageFlag, languageToKey } from '@/lib/ai/languages';

/* ── Activity ────────────────────────────────────────────────────── */

export function ActivityTab({ calls, businesses }: { calls: CallLog[]; businesses: Business[] }) {
  const nameOf = (id: string | null) => businesses.find((b) => b.id === id)?.name ?? '—';
  return (
    <div className="space-y-6">
      <LanguageBreakdown calls={calls} />

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
                <th className="px-5 py-3 font-medium">Language</th>
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
                  <td className="px-5 py-3.5 text-[12px] text-muted">
                    {c.language ? `${languageFlag(c.language)} ${languageToKey(c.language)}` : '—'}
                  </td>
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
    </div>
  );
}

/* ── Language mix ────────────────────────────────────────────────── */

/* Deliberately monochrome except the leader: the point is the proportions,
   not a colour wheel. */
const SLICE_FILLS = ['var(--accent)', 'var(--ink)', 'color-mix(in srgb, var(--ink) 55%, transparent)',
  'color-mix(in srgb, var(--ink) 32%, transparent)', 'color-mix(in srgb, var(--ink) 18%, transparent)'];

export function LanguageBreakdown({ calls }: { calls: CallLog[] }) {
  const withLang = calls.filter((c) => c.language);
  const counts = new Map<string, number>();
  for (const c of withLang) {
    const k = languageToKey(c.language!);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const total = withLang.length;
  const slices = Array.from(counts.entries())
    .map(([key, n]) => ({ key, n, pct: (n / total) * 100 }))
    .sort((a, b) => b.n - a.n);

  if (!total) {
    return (
      <section className="rounded-brand border border-line bg-paper p-5">
        <h2 className="font-display text-[14px] font-semibold text-ink">Languages spoken</h2>
        <p className="mt-2 text-[12px] leading-relaxed text-muted">
          No language recorded yet. It is written when a call ends, so this fills in as calls complete.
        </p>
      </section>
    );
  }

  /* Donut geometry: one circle, stroke dashes per slice. */
  const R = 42;
  const C = 2 * Math.PI * R;
  let offset = 0;

  return (
    <section className="rounded-brand border border-line bg-paper p-5">
      <h2 className="font-display text-[14px] font-semibold text-ink">Languages spoken</h2>
      <p className="mt-0.5 text-[12px] text-muted">What customers actually used, across {total} call{total === 1 ? '' : 's'}</p>

      <div className="mt-5 flex flex-wrap items-center gap-8">
        <svg viewBox="0 0 100 100" className="h-32 w-32 shrink-0 -rotate-90" role="img" aria-label="Languages spoken">
          {slices.map((s, i) => {
            const len = (s.pct / 100) * C;
            const el = (
              <circle
                key={s.key}
                cx="50" cy="50" r={R}
                fill="none"
                stroke={SLICE_FILLS[i % SLICE_FILLS.length]}
                strokeWidth="14"
                strokeDasharray={`${len} ${C - len}`}
                strokeDashoffset={-offset}
              />
            );
            offset += len;
            return el;
          })}
        </svg>

        <ul className="min-w-[180px] flex-1 space-y-2.5">
          {slices.map((s, i) => (
            <li key={s.key} className="flex items-center gap-3 text-[13px]">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: SLICE_FILLS[i % SLICE_FILLS.length] }}
              />
              <span className="flex-1 text-ink">
                {LANGUAGES[s.key as keyof typeof LANGUAGES].flag} {LANGUAGES[s.key as keyof typeof LANGUAGES].label}
              </span>
              <span className="tabular-nums text-muted">{Math.round(s.pct)}%</span>
              <span className="w-8 text-right tabular-nums text-muted">{s.n}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
