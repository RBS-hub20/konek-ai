'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Activity } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Waveform } from '@/components/ui/Waveform';
import type { CallLog } from '@/lib/types2';
import { vibeToLabel } from '@/lib/types2';
import { LANGUAGES, languageFlag, languageToKey } from '@/lib/ai/languages';

/* ── Live feed ───────────────────────────────────────────────────── */

export function LiveFeed({ calls }: { calls: CallLog[] }) {
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
                  {c.language && (
                    <Badge title={LANGUAGES[languageToKey(c.language)].label}>
                      {languageFlag(c.language)} {languageToKey(c.language)}
                    </Badge>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </section>
  );
}
