'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Activity, X } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Waveform } from '@/components/ui/Waveform';
import type { CallLog } from '@/lib/types2';
import { vibeToLabel } from '@/lib/types2';
import { LANGUAGES, languageFlag, languageToKey } from '@/lib/ai/languages';
import { cn } from '@/lib/utils';
import { CallPlayer, CallTranscript } from '@/components/super-admin/CallPlayer';

/* ── Live feed ───────────────────────────────────────────────────── */

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'hot', label: 'Hot only' },
  { key: 'PH', label: '🇵🇭 PH' },
  { key: 'AE', label: '🇦🇪 AE' },
] as const;

export function LiveFeed({ calls }: { calls: CallLog[] }) {
  const [filter, setFilter] = useState<string>('all');
  /* Clicking a call opens it, because "how did that one go" is the next
     question after seeing it in the feed. */
  const [open, setOpen] = useState<CallLog | null>(null);

  const shown = calls.filter((c) => {
    if (filter === 'all') return true;
    if (filter === 'hot') return c.status === 'Hot Lead' || c.status === 'Hot';
    /* Country is not on the row, so it is read off the number it dialled. */
    const dial = filter === 'PH' ? '+63' : '+971';
    return (c.phone ?? '').startsWith(dial);
  });

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

      <div className="flex gap-1.5 border-b border-line px-5 py-3">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={cn(
              'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors focus-ring',
              filter === f.key ? 'border-ink bg-surface text-ink' : 'border-line text-muted hover:text-ink'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="px-5 py-10 text-center text-[13px] text-muted">
          {calls.length === 0 ? 'No calls across the platform yet.' : 'No calls match this filter.'}
        </p>
      ) : (
        <div className="divide-y divide-line">
          <AnimatePresence initial={false}>
            {shown.slice(0, 6).map((c, i) => (
              <motion.button
                type="button"
                key={c.id} layout
                onClick={() => setOpen(c)}
                initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                className="w-full px-5 py-4 text-left transition-colors hover:bg-surface focus-ring"
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
                  {c.language && (
                    <Badge title={LANGUAGES[languageToKey(c.language)].label}>
                      {languageFlag(c.language)} {languageToKey(c.language)}
                    </Badge>
                  )}
                </div>
              </motion.button>
            ))}
          </AnimatePresence>
        </div>
      )}

      {open && <CallDetail call={open} onClose={() => setOpen(null)} />}
    </section>
  );
}

/* ── One call, opened ────────────────────────────────────────────── */

/* The audio streams through the app rather than from Twilio: Twilio's media
   URL needs the account credentials, which do not belong in a page. */
function CallDetail({ call, onClose }: { call: CallLog; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:items-center"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog" aria-modal="true" aria-label="Call detail"
        className="my-auto w-full max-w-[520px] overflow-hidden rounded-brand border border-line bg-paper shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-line p-5">
          <div className="min-w-0">
            <div className="truncate font-display text-[15px] font-semibold text-ink">
              {call.customer_name || 'Unknown'}
            </div>
            <div className="mt-0.5 font-mono text-[12px] text-muted">{call.phone}</div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Badge tone={call.status === 'Hot Lead' ? 'accent' : 'default'}>{call.status}</Badge>
              <Badge>{Math.floor(call.duration_seconds / 60)}:{String(call.duration_seconds % 60).padStart(2, '0')}</Badge>
              {call.language && <Badge>{languageFlag(call.language)} {languageToKey(call.language)}</Badge>}
              {call.is_trial && <Badge tone="accent">demo</Badge>}
            </div>
          </div>
          <button
            type="button" onClick={onClose} aria-label="Close"
            className="-mr-1 -mt-1 rounded p-1.5 text-muted transition-colors hover:text-ink focus-ring"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          <div>
            <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted">
              How Cindy sounded
            </div>
            <CallPlayer call={call} compact />
          </div>

          <div>
            <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted">Transcript</div>
            <CallTranscript call={call} />
          </div>
        </div>
      </div>
    </div>
  );
}
