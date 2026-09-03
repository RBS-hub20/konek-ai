'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Pause, Phone, Play } from 'lucide-react';
import { VIBES, VIBE_DETAIL, type Vibe } from '@/lib/mockData';
import { Waveform } from '@/components/ui/Waveform';
import { cn } from '@/lib/utils';

const SEEDS: Record<Vibe, number> = {
  'PRO CLOSER': 21,
  'FRIENDLY TITO': 47,
  'GEN-Z HYPE': 88,
  'CALM CARE': 12,
};

export function VoiceDemo() {
  const [vibe, setVibe] = useState<Vibe>('PRO CLOSER');
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(1);

  /* Simulated playhead — real audio would drive this */
  useEffect(() => {
    if (!playing) return;
    setProgress(0);
    const id = setInterval(() => {
      setProgress((p) => {
        if (p >= 1) {
          setPlaying(false);
          return 1;
        }
        return p + 0.012;
      });
    }, 60);
    return () => clearInterval(id);
  }, [playing, vibe]);

  const detail = VIBE_DETAIL[vibe];

  return (
    <div className="rounded-brand border border-line bg-paper p-6 md:p-7">
      {/* Caller header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full border border-line">
            <Phone className="h-4 w-4 text-ink" />
          </span>
          <div className="leading-tight">
            <div className="text-[13px] font-medium text-ink">Live call · Nova Aesthetics</div>
            <div className="text-[11px] text-muted">+63 917 000 8642</div>
          </div>
        </div>
        <span className="flex items-center gap-2 text-[11px] font-medium text-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse-dot" />
          {playing ? 'Speaking' : 'Ready'}
        </span>
      </div>

      {/* Waveform + transport */}
      <div className="mt-7 flex items-center gap-4">
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? 'Pause demo' : 'Play demo'}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink text-paper transition-opacity hover:opacity-85 focus-ring"
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
        </button>
        <Waveform
          bars={44}
          seed={SEEDS[vibe]}
          playing={playing}
          progress={playing ? progress : 1}
          height={44}
          className="flex-1"
        />
      </div>

      {/* Vibe switcher */}
      <div className="mt-7 border-t border-line pt-6">
        <div className="eyebrow mb-3">Vibe Switcher</div>
        <div className="flex flex-wrap gap-2">
          {VIBES.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => {
                setVibe(v);
                setPlaying(false);
                setProgress(1);
              }}
              className={cn(
                'h-8 rounded-brand border px-3 text-[11px] font-medium uppercase tracking-wide transition-colors focus-ring',
                v === vibe
                  ? 'border-ink bg-ink text-paper'
                  : 'border-line bg-paper text-muted hover:text-ink hover:bg-surface'
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Script preview */}
      <div className="mt-6 min-h-[148px] rounded-brand bg-surface p-5">
        <AnimatePresence mode="wait">
          <motion.div
            key={vibe}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="text-[11px] font-medium uppercase tracking-wide text-accent">
              {detail.tagline}
            </div>
            <p className="mt-2.5 text-[13px] leading-relaxed text-ink">“{detail.script}”</p>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
