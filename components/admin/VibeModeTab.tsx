'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Button } from '@/components/ui/Button';
import { Waveform } from '@/components/ui/Waveform';
import { VIBES, VIBE_DETAIL, type Vibe } from '@/lib/mockData';
import { useKonekStore } from '@/lib/store';
import { cn } from '@/lib/utils';

const SEEDS: Record<Vibe, number> = {
  'PRO CLOSER': 21,
  'FRIENDLY TITO': 47,
  'GEN-Z HYPE': 88,
  'CALM CARE': 12,
};

export function VibeModeTab() {
  const { vibe, setVibe } = useKonekStore();
  const detail = VIBE_DETAIL[vibe];

  return (
    <div className="space-y-7">
      <div>
        <h1 className="font-display text-[22px] font-semibold tracking-tight text-ink">Vibe Mode</h1>
        <p className="mt-1.5 text-[13px] text-muted">
          One personality for every call. Change it any time — nothing else has to change.
        </p>
      </div>

      {/* Pills — selected is black on light, white on dark */}
      <div className="flex flex-wrap gap-2.5">
        {VIBES.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setVibe(v)}
            aria-pressed={v === vibe}
            className={cn(
              'h-10 rounded-brand border px-5 text-[12px] font-semibold uppercase tracking-wide transition-colors focus-ring',
              v === vibe
                ? 'border-ink bg-ink text-paper'
                : 'border-line bg-paper text-muted hover:text-ink hover:bg-surface'
            )}
          >
            {v}
          </button>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Example script */}
        <AnimatePresence mode="wait">
          <motion.section
            key={vibe}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
            className="rounded-brand border border-line bg-paper p-6 md:p-7"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="font-display text-[16px] font-semibold text-ink">{vibe}</h2>
              <span className="text-[12px] font-medium text-accent">{detail.tagline}</span>
            </div>
            <p className="mt-3 text-[13px] leading-relaxed text-muted">{detail.description}</p>

            <Waveform bars={56} seed={SEEDS[vibe]} height={38} className="mt-7" />

            <div className="mt-7 border-t border-line pt-6">
              <div className="eyebrow">Example Script</div>
              <p className="mt-3 text-[14px] leading-relaxed text-ink">“{detail.script}”</p>
            </div>

            <div className="mt-7 flex gap-2">
              <Button size="sm">Play sample</Button>
              <Button size="sm" variant="secondary">Test call myself</Button>
            </div>
          </motion.section>
        </AnimatePresence>

        {/* All vibes at a glance */}
        <section className="rounded-brand border border-line bg-paper p-6">
          <h2 className="font-display text-[14px] font-semibold text-ink">All Vibes</h2>
          <div className="mt-5 space-y-4">
            {VIBES.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setVibe(v)}
                className={cn(
                  'w-full rounded-brand border p-4 text-left transition-colors focus-ring',
                  v === vibe ? 'border-ink bg-surface' : 'border-line hover:bg-surface'
                )}
              >
                <div className="text-[12px] font-semibold uppercase tracking-wide text-ink">{v}</div>
                <div className="mt-1 text-[11px] text-muted">{VIBE_DETAIL[v].tagline}</div>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
