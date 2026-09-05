'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/Button';
import { Switch } from '@/components/ui/Switch';
import { Waveform } from '@/components/ui/Waveform';
import { VIBE_CONFIG } from '@/lib/ai/vibes';
import { LANGUAGES, LANGUAGE_KEYS, SAMPLES, type LanguageKey } from '@/lib/ai/languages';
import { VIBE_KEYS, type VibeKey } from '@/lib/types2';
import { useKonekStore } from '@/lib/store';
import { TestCallDialog } from './TestCallDialog';
import { cn } from '@/lib/utils';

const SEEDS: Record<VibeKey, number> = {
  PRO_CLOSER: 21, FRIENDLY_TITO: 47, GEN_Z_HYPE: 88, CALM_CARE: 12,
};

export function VibeModeTab() {
  const { vibe, setVibe, language, setLanguage, business, setBusinessField } = useKonekStore();
  const autoLanguage = business?.auto_language !== false;
  const [testOpen, setTestOpen] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const detail = VIBE_CONFIG[vibe];
  const lang = LANGUAGES[language];
  /* The script shown is the vibe as spoken in the selected language. */
  const sample = SAMPLES[vibe][language];

  /* "Play sample" speaks the vibe's script with the browser's own voice.
     Cartesia is not configured on this deployment, so there is no recorded
     audio to stream — this at least lets you hear the pacing and wording. */
  const playSample = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(sample);
    u.lang = lang.bcp47;
    u.rate = vibe === 'GEN_Z_HYPE' ? 1.15 : vibe === 'CALM_CARE' ? 0.9 : 1;
    u.pitch = vibe === 'CALM_CARE' ? 0.95 : 1;
    u.onstart = () => setSpeaking(true);
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(u);
  };

  return (
    <div className="space-y-7">
      <div>
        <h1 className="font-display text-[22px] font-semibold tracking-tight text-ink">Vibe Mode</h1>
        <p className="mt-1.5 text-[13px] text-muted">
          One personality and one language for every call. Both save to your business and apply to the next call.
        </p>
      </div>

      <div className="flex flex-wrap gap-2.5">
        {VIBE_KEYS.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => void setVibe(v)}
            aria-pressed={v === vibe}
            className={cn(
              'h-10 rounded-brand border px-5 text-[12px] font-semibold uppercase tracking-wide transition-colors focus-ring',
              v === vibe
                ? 'border-ink bg-ink text-paper'
                : 'border-line bg-paper text-muted hover:text-ink hover:bg-surface'
            )}
          >
            {VIBE_CONFIG[v].label}
          </button>
        ))}
      </div>

      {/* Language — independent of the vibe, so every vibe speaks every language */}
      <div>
        <div className="eyebrow mb-3">Language</div>
        <div className="flex flex-wrap gap-2">
          {LANGUAGE_KEYS.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => void setLanguage(l)}
              aria-pressed={l === language}
              className={cn(
                'h-9 rounded-brand border px-4 text-[12px] font-medium transition-colors focus-ring',
                l === language
                  ? 'border-ink bg-ink text-paper'
                  : 'border-line bg-paper text-muted hover:bg-surface hover:text-ink'
              )}
            >
              {LANGUAGES[l].label}
              <span className="ml-2 text-[11px] opacity-60">{LANGUAGES[l].native}</span>
            </button>
          ))}
        </div>
        {/* Adaptation is what most callers actually notice, so it sits with
            the language choice rather than buried in Settings. */}
        <div className="mt-4 flex items-start justify-between gap-4 rounded-brand border border-line bg-paper p-4">
          <div className="min-w-0">
            <div className="text-[13px] font-medium text-ink">Auto-detect language</div>
            <p className="mt-1 text-[12px] leading-relaxed text-muted">
              {autoLanguage
                ? `KONEK opens in ${lang.label} and then follows the customer — answer in English and it stays in English, answer in Arabic and it switches. It never announces the change.`
                : `Every call stays in ${lang.label}, whatever the customer speaks.`}
            </p>
          </div>
          <Switch
            checked={autoLanguage}
            onCheckedChange={(v) => void setBusinessField({ auto_language: v })}
            label="Auto-detect language"
          />
        </div>

        {lang.fallbackApproximate && (
          <p className="mt-2.5 text-[11px] leading-relaxed text-muted">
            Twilio has no Filipino voice, so without the conversation bridge the fallback reads this with an
            English voice. With the bridge connected, {lang.label} is spoken properly.
          </p>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <motion.section
          key={`${vibe}-${language}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
          className="rounded-brand border border-line bg-paper p-6 md:p-7"
        >
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="font-display text-[16px] font-semibold text-ink">
                {detail.label} <span className="text-muted">· {lang.label}</span>
              </h2>
              <span className="text-[12px] font-medium text-accent">{detail.tagline}</span>
            </div>
            <p className="mt-3 text-[13px] leading-relaxed text-muted">{detail.style}</p>

            <Waveform bars={56} seed={SEEDS[vibe]} playing={speaking} height={38} className="mt-7" />

            <div className="mt-7 border-t border-line pt-6">
              <div className="eyebrow">Example Script</div>
              <p
                className="mt-3 text-[14px] leading-relaxed text-ink"
                dir={language === 'AR' ? 'rtl' : 'ltr'}
                lang={lang.bcp47}
              >
                “{sample}”
              </p>
            </div>

            <div className="mt-7 flex flex-wrap gap-2">
              <Button size="sm" onClick={playSample}>{speaking ? 'Playing…' : 'Play sample'}</Button>
              <Button size="sm" variant="secondary" onClick={() => setTestOpen(true)}>Test call myself</Button>
            </div>
            <p className="mt-3 text-[11px] text-muted">
              Test call dials from {business?.outbound_number ?? 'your outbound number'} in the {detail.label} vibe,
              speaking {lang.label}.
            </p>
        </motion.section>

        <section className="rounded-brand border border-line bg-paper p-6">
          <h2 className="font-display text-[14px] font-semibold text-ink">All Vibes</h2>
          <div className="mt-5 space-y-4">
            {VIBE_KEYS.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => void setVibe(v)}
                className={cn(
                  'w-full rounded-brand border p-4 text-left transition-colors focus-ring',
                  v === vibe ? 'border-ink bg-surface' : 'border-line hover:bg-surface'
                )}
              >
                <div className="text-[12px] font-semibold uppercase tracking-wide text-ink">{VIBE_CONFIG[v].label}</div>
                <div className="mt-1 text-[11px] text-muted">{VIBE_CONFIG[v].tagline}</div>
              </button>
            ))}
          </div>
        </section>
      </div>

      <TestCallDialog open={testOpen} onClose={() => setTestOpen(false)} vibe={vibe} language={language} />
    </div>
  );
}
