'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowRight, Check, Loader2, Pause, Phone, Play } from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { INCLUDED, KEEP_CINDY, STAFF_COMPARISON, TRIAL_DAYS, PRICE } from '@/lib/trial';
import { rememberTrial } from '@/lib/trialSession';

/* useSearchParams cannot be prerendered without a boundary. */
export default function WelcomePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-paper" />}>
      <Welcome />
    </Suspense>
  );
}

type CallState = {
  status: string;
  /* Twilio's state in words: "Your phone is ringing", "No answer", … */
  label: string;
  rang: boolean;
  finished: boolean;
  failed: boolean;
  ready: boolean;
  transcript: string | null;
  recordingUrl: string | null;
  durationSeconds: number;
  failureReason?: string;
};

function Welcome() {
  const params = useSearchParams();
  const callId = params.get('callId');
  const callToken = params.get('t');
  const businessName = params.get('name') || 'your business';
  const phone = params.get('phone') || '';
  const industry = params.get('industry') || '';
  const country = params.get('country') || '';

  const [call, setCall] = useState<CallState | null>(null);
  const [waited, setWaited] = useState(0);

  /* Carried into onboarding so the wizard opens already filled in — the
     visitor never typed an account, so this is all we know about them. */
  useEffect(() => {
    rememberTrial({ businessName, phone, industry, country, callId });
  }, [businessName, phone, industry, country, callId]);

  const poll = useCallback(async () => {
    if (!callId) return true;
    try {
      const q = callToken ? `?t=${encodeURIComponent(callToken)}` : '';
      const res = await fetch(`/api/try-free-call/${callId}${q}`, { cache: 'no-store' });
      if (!res.ok) return false;
      const body = (await res.json()) as CallState;
      setCall(body);
      /* Stop once Twilio is done with it, however it ended. */
      return body.finished || body.ready;
    } catch {
      return false;
    }
  }, [callId, callToken]);

  /* The recording and transcript only exist once Twilio posts the call back,
     so this polls rather than blocking the page on it. */
  useEffect(() => {
    if (!callId) return;
    let alive = true;
    void poll();
    const t = setInterval(async () => {
      if (!alive) return;
      setWaited((w) => w + 5);
      const done = await poll();
      if (done) clearInterval(t);
    }, 5000);
    /* Two minutes is longer than any 30-second demo needs. */
    const stop = setTimeout(() => clearInterval(t), 120_000);
    return () => { alive = false; clearInterval(t); clearTimeout(stop); };
  }, [callId, poll]);

  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-line">
        <div className="shell flex h-16 items-center justify-between">
          <Link href="/" className="focus-ring rounded-brand"><Logo size="md" /></Link>
          <span className="text-[12px] text-muted">Step 1 of 2 · no account yet</span>
        </div>
      </header>

      <main className="shell max-w-3xl py-14 md:py-20">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <span className="eyebrow">Your demo call</span>
          {/* The page used to congratulate the visitor on a call that may
              never have connected. It now says what actually happened. */}
          <h1 className="mt-5 font-display text-[34px] font-semibold leading-[1.1] tracking-[-0.02em] text-ink sm:text-[42px]">
            {call?.failed
              ? 'That call did not connect'
              : call?.rang
                ? '🎉 Cindy just called you!'
                : 'Cindy is calling you now'}
          </h1>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted">
            {call?.failed ? (
              <>
                {call.failureReason ?? 'The carrier would not put the call through.'} Nothing was
                charged, and you can still set Cindy up below.
              </>
            ) : (
              <>
                Cindy is on a real phone line, reading a real script, at{' '}
                <span className="text-ink">{phone || 'your number'}</span>. Every business on KONEK AI
                gets the same voice — pointed at their own customers instead of a demo.
              </>
            )}
          </p>
        </motion.div>

        <CallCard call={call} callId={callId} waited={waited} />

        {/* ── Keep Cindy ─────────────────────────────────────────── */}
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
          className="mt-10 overflow-hidden rounded-brand border-2 border-ink bg-paper"
        >
          <div className="p-7 md:p-9">
            <Badge tone="accent">{KEEP_CINDY.heading}</Badge>
            <h2 className="mt-4 font-display text-[24px] font-semibold leading-tight tracking-[-0.02em] text-ink sm:text-[28px]">
              Unlock Cindy for {businessName} 24/7
            </h2>
            <p className="mt-3 text-[14px] leading-relaxed text-muted">
              {KEEP_CINDY.trialOffer}. {KEEP_CINDY.reassurance}
            </p>

            <ul className="mt-7 grid gap-3 sm:grid-cols-2">
              {INCLUDED.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-[13px] text-ink">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            <Comparison />

            <Link href="/dashboard/onboarding?from=trial" className="mt-8 block">
              <Button size="lg" className="w-full gap-2">
                {KEEP_CINDY.cta} → Go to Setup <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <p className="mt-3 text-center text-[12px] text-muted">{KEEP_CINDY.socialProof}</p>
          </div>
        </motion.section>

        <p className="mt-8 text-center text-[12px] text-muted">
          Not now?{' '}
          <Link href="/" className="text-accent hover:underline">Back to the site</Link>
          {' · '}Your demo call is not charged and nothing was signed up for.
        </p>
      </main>
    </div>
  );
}

/* ── The call itself ─────────────────────────────────────────────── */

function CallCard({ call, callId, waited }: { call: CallState | null; callId: string | null; waited: number }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  const recording = call?.recordingUrl ?? null;
  /* Twilio serves the recording without an extension; .mp3 is the playable one. */
  const src = recording ? (recording.endsWith('.mp3') ? recording : `${recording}.mp3`) : null;

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) { el.pause(); setPlaying(false); return; }
    void el.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  };

  return (
    <section className="mt-9 rounded-brand border border-line bg-surface p-6 md:p-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-paper">
            <Phone className="h-4 w-4 text-ink" />
          </span>
          <div>
            <div className="text-[13px] font-medium text-ink">{call?.label ?? 'Connecting…'}</div>
            <div className="text-[12px] text-muted">
              {call?.failureReason
                ? call.failureReason
                : call?.durationSeconds
                  ? `${call.durationSeconds}s on the line`
                  : 'Duration lands when the call ends'}
            </div>
          </div>
        </div>

        {src ? (
          <>
            <Button variant="secondary" size="sm" className="gap-1.5" onClick={toggle}>
              {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              {playing ? 'Pause' : 'Play the recording'}
            </Button>
            <audio
              ref={audioRef}
              src={src}
              onEnded={() => setPlaying(false)}
              onPause={() => setPlaying(false)}
              className="hidden"
            />
          </>
        ) : (
          <span className="flex items-center gap-2 text-[12px] text-muted">
            {!call?.finished && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {!callId
              ? 'No call to play'
              : call?.failed
                ? 'Nothing to play — the call never connected'
                : 'Recording appears here when the call ends'}
          </span>
        )}
      </div>

      <div className="mt-6 border-t border-line pt-5">
        <div className="text-[12px] font-medium uppercase tracking-wide text-muted">Transcript</div>
        {call?.transcript ? (
          <p className="mt-3 whitespace-pre-wrap text-[13px] leading-relaxed text-ink">{call.transcript}</p>
        ) : (
          <p className="mt-3 text-[13px] leading-relaxed text-muted">
            {call?.failed
              ? 'No transcript — there was no conversation to write up.'
              : waited > 60
                ? 'No transcript came back for this one. The setup below is unaffected.'
                : 'Writing up what was said…'}
          </p>
        )}
      </div>
    </section>
  );
}

/* ── What it replaces ────────────────────────────────────────────── */

/* The price only lands next to what a person costs, so the two sit side by
   side rather than in a paragraph. */
function Comparison() {
  return (
    <div className="mt-7 grid gap-px overflow-hidden rounded-brand border border-line bg-line sm:grid-cols-2">
      <div className="bg-surface p-5">
        <div className="text-[12px] font-medium uppercase tracking-wide text-muted">
          {STAFF_COMPARISON.staff.label}
        </div>
        <div className="mt-2 font-display text-[26px] font-semibold text-muted line-through decoration-1">
          {STAFF_COMPARISON.staff.price}
        </div>
        <div className="mt-1.5 text-[12px] text-muted">{STAFF_COMPARISON.staff.catch}</div>
      </div>
      <div className="bg-paper p-5">
        <div className="text-[12px] font-medium uppercase tracking-wide text-ink">
          {STAFF_COMPARISON.cindy.label}
        </div>
        <div className="mt-2 font-display text-[26px] font-semibold text-ink">
          {PRICE.symbol}{PRICE.monthly}<span className="text-[14px] font-normal text-muted">/mo</span>
        </div>
        <div className="mt-1.5 text-[12px] text-accent">{STAFF_COMPARISON.cindy.catch}</div>
      </div>
      <div className="bg-paper px-5 py-3 text-[11px] text-muted sm:col-span-2">
        First {TRIAL_DAYS} days free. No card until you keep her.
      </div>
    </div>
  );
}
