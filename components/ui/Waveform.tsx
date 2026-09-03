'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

/* Deterministic pseudo-random bars — identical on server and client,
   so the waveform never causes a hydration mismatch. */
function seededBars(seed: number, count: number) {
  const bars: number[] = [];
  let s = seed || 1;
  for (let i = 0; i < count; i++) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const base = (s / 2147483648) * 0.75 + 0.18;
    /* Give it a speech-like envelope rather than pure noise */
    const envelope = 0.55 + 0.45 * Math.sin((i / count) * Math.PI * 3.1);
    bars.push(Math.min(1, base * envelope + 0.12));
  }
  return bars;
}

export function Waveform({
  bars = 48,
  seed = 7,
  playing = false,
  progress = 1,
  className,
  barClassName,
  height = 40,
}: {
  bars?: number;
  seed?: number;
  playing?: boolean;
  /* 0–1 — bars past this point render as inactive */
  progress?: number;
  className?: string;
  barClassName?: string;
  height?: number;
}) {
  const data = seededBars(seed, bars);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setTick((t) => t + 1), 110);
    return () => clearInterval(id);
  }, [playing]);

  return (
    <div className={cn('flex w-full items-center gap-[3px]', className)} style={{ height }} aria-hidden>
      {data.map((v, i) => {
        const active = i / bars <= progress;
        const live = playing && active ? 0.55 + 0.45 * Math.abs(Math.sin((i + tick) * 0.7)) : 1;
        return (
          <span
            key={i}
            className={cn(
              'flex-1 rounded-full transition-[height,background-color] duration-150',
              active ? 'bg-ink' : 'bg-line',
              barClassName
            )}
            /* Fixed precision — float formatting differs between Node and the browser */
            style={{ height: `${Math.max(6, v * live * height).toFixed(2)}px` }}
          />
        );
      })}
    </div>
  );
}
