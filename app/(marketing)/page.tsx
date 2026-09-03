'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, Check, Play } from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { Button } from '@/components/ui/Button';
import { VoiceDemo } from '@/components/marketing/VoiceDemo';
import { HOW_IT_WORKS, PRICING, USE_CASES, VIBES, VIBE_DETAIL } from '@/lib/mockData';
import { cn } from '@/lib/utils';

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-80px' },
  transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] as const },
};

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-paper">
      {/* ── Navigation ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-line bg-paper/85 backdrop-blur-md">
        <div className="shell flex h-16 items-center justify-between">
          <Link href="/" className="focus-ring rounded-brand">
            <Logo size="md" />
          </Link>
          <nav className="hidden items-center gap-8 md:flex">
            <a href="#how" className="text-[13px] text-muted transition-colors hover:text-ink">How it works</a>
            <a href="#vibes" className="text-[13px] text-muted transition-colors hover:text-ink">Vibes</a>
            <a href="#pricing" className="text-[13px] text-muted transition-colors hover:text-ink">Pricing</a>
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link href="/admin" className="hidden sm:block">
              <Button variant="ghost" size="sm">Login</Button>
            </Link>
            <Link href="/admin">
              <Button size="sm">Get Started</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────────────── */}
      <section className="shell grid items-center gap-14 py-20 md:py-28 lg:grid-cols-2 lg:gap-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <span className="eyebrow">Universal AI Voice Calling</span>
          <h1 className="mt-6 font-display text-[46px] font-semibold leading-[1.03] tracking-[-0.03em] text-ink sm:text-[60px] lg:text-[68px]">
            A Voice That
            <br />
            Sells.
          </h1>
          <p className="mt-6 max-w-[30rem] text-[15px] leading-relaxed text-muted">
            One Platform. Any Business. Any Vibe. Upload your business, KONEK AI calls your
            customers on a real phone number.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link href="/admin">
              <Button size="lg" className="gap-2">
                Try Free Call <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Button variant="secondary" size="lg" className="gap-2">
              <Play className="h-3.5 w-3.5" /> Watch 30s Demo
            </Button>
          </div>
          <div className="mt-10 flex flex-wrap items-center gap-x-7 gap-y-2 text-[12px] text-muted">
            <span>No credit card</span>
            <span className="hidden h-3 w-px bg-line sm:block" />
            <span>Live in 5 minutes</span>
            <span className="hidden h-3 w-px bg-line sm:block" />
            <span>Real phone number</span>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
        >
          <VoiceDemo />
        </motion.div>
      </section>

      {/* ── Powered by ─────────────────────────────────────────── */}
      <section className="border-y border-line bg-surface">
        <div className="shell flex flex-col items-center gap-3 py-10 text-center">
          <span className="eyebrow">Powered By</span>
          <p className="font-display text-[15px] font-medium text-ink sm:text-[17px]">
            Built on Cartesia Sonic + Chatterbox — Real Human Voice
          </p>
        </div>
      </section>

      {/* ── How it works ───────────────────────────────────────── */}
      <section id="how" className="shell py-24 md:py-32">
        <motion.div {...fadeUp}>
          <span className="eyebrow">How It Works</span>
          <h2 className="mt-5 max-w-xl font-display text-[32px] font-semibold leading-tight tracking-[-0.02em] text-ink sm:text-[40px]">
            Three steps. Then it calls.
          </h2>
        </motion.div>
        <div className="mt-14 grid gap-px overflow-hidden rounded-brand border border-line bg-line md:grid-cols-3">
          {HOW_IT_WORKS.map((s, i) => (
            <motion.div
              key={s.step}
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: i * 0.08 }}
              className="bg-paper p-8 md:p-9"
            >
              <span className="font-display text-[12px] font-medium tabular-nums text-muted">{s.step}</span>
              <h3 className="mt-6 font-display text-[17px] font-semibold text-ink">{s.title}</h3>
              <p className="mt-3 text-[13px] leading-relaxed text-muted">{s.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── Vibe Mode ──────────────────────────────────────────── */}
      <section id="vibes" className="border-t border-line bg-surface py-24 md:py-32">
        <div className="shell">
          <motion.div {...fadeUp}>
            <span className="eyebrow">Vibe Mode</span>
            <h2 className="mt-5 max-w-2xl font-display text-[32px] font-semibold leading-tight tracking-[-0.02em] text-ink sm:text-[40px]">
              Same brain. Four personalities.
            </h2>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted">
              A Dubai property buyer and a Cebu salon client do not want the same voice. Switch the
              vibe, keep everything else.
            </p>
          </motion.div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {VIBES.map((v, i) => (
              <motion.div
                key={v}
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: i * 0.06 }}
                className="rounded-brand border border-line bg-paper p-6"
              >
                <div className="font-display text-[12px] font-semibold uppercase tracking-wide text-ink">
                  {v}
                </div>
                <div className="mt-1.5 text-[11px] font-medium text-accent">{VIBE_DETAIL[v].tagline}</div>
                <p className="mt-4 text-[13px] leading-relaxed text-muted">{VIBE_DETAIL[v].description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Use cases ──────────────────────────────────────────── */}
      <section className="shell py-24 md:py-32">
        <motion.div {...fadeUp}>
          <span className="eyebrow">Use Cases</span>
          <h2 className="mt-5 max-w-2xl font-display text-[32px] font-semibold leading-tight tracking-[-0.02em] text-ink sm:text-[40px]">
            Any business with a phone number.
          </h2>
        </motion.div>
        <div className="mt-14 grid gap-px overflow-hidden rounded-brand border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
          {USE_CASES.map((u, i) => (
            <motion.div
              key={u.name}
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: (i % 3) * 0.06 }}
              className="flex flex-col justify-between gap-8 bg-paper p-7 md:p-8"
            >
              <div>
                <h3 className="font-display text-[16px] font-semibold text-ink">{u.name}</h3>
                <p className="mt-3 text-[13px] leading-relaxed text-muted">{u.line}</p>
              </div>
              <div className="flex items-center justify-between border-t border-line pt-4">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted">{u.vibe}</span>
                <span className="text-[12px] font-medium text-accent">{u.metric}</span>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── Pricing ────────────────────────────────────────────── */}
      <section id="pricing" className="border-t border-line bg-surface py-24 md:py-32">
        <div className="shell">
          <motion.div {...fadeUp} className="text-center">
            <span className="eyebrow">Pricing</span>
            <h2 className="mx-auto mt-5 max-w-xl font-display text-[32px] font-semibold leading-tight tracking-[-0.02em] text-ink sm:text-[40px]">
              Cheaper than one agent. Never sleeps.
            </h2>
          </motion.div>
          <div className="mx-auto mt-14 grid max-w-5xl gap-5 lg:grid-cols-3">
            {PRICING.map((p, i) => (
              <motion.div
                key={p.name}
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: i * 0.07 }}
                className={cn(
                  'flex flex-col rounded-brand border bg-paper p-8',
                  p.highlight ? 'border-2 border-ink' : 'border-line'
                )}
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-[15px] font-semibold text-ink">{p.name}</h3>
                  {p.highlight && (
                    <span className="rounded-full bg-ink px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-paper">
                      Most Popular
                    </span>
                  )}
                </div>
                <div className="mt-7 flex items-baseline gap-1">
                  <span className="font-display text-[40px] font-semibold leading-none tracking-tight text-ink">
                    {p.price}
                  </span>
                  {p.period && <span className="text-[13px] text-muted">{p.period}</span>}
                </div>
                <div className="mt-2.5 text-[12px] text-muted">{p.calls}</div>
                <ul className="mt-8 flex flex-1 flex-col gap-3">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-[13px] text-ink">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link href="/admin" className="mt-9">
                  <Button variant={p.highlight ? 'primary' : 'secondary'} className="w-full">
                    {p.cta}
                  </Button>
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer CTA ─────────────────────────────────────────── */}
      <section className="border-t border-line">
        <div className="shell flex flex-col items-center gap-8 py-24 text-center md:py-32">
          <motion.h2
            {...fadeUp}
            className="max-w-2xl font-display text-[36px] font-semibold leading-[1.08] tracking-[-0.03em] text-ink sm:text-[52px]"
          >
            Your customers are waiting for a call.
          </motion.h2>
          <motion.div {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.08 }}>
            <Link href="/admin">
              <Button size="lg" className="gap-2">
                Try Free Call <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer className="border-t border-line">
        <div className="shell flex flex-col gap-8 py-12 md:flex-row md:items-center md:justify-between">
          <div>
            <Logo size="sm" />
            <p className="mt-3 text-[12px] text-muted">A Voice That Sells.</p>
          </div>
          <div className="flex flex-wrap items-center gap-x-7 gap-y-3 text-[12px] text-muted">
            <Link href="/admin" className="transition-colors hover:text-ink">Dashboard</Link>
            <Link href="/super-admin" className="transition-colors hover:text-ink">Super Admin</Link>
            <a href="#pricing" className="transition-colors hover:text-ink">Pricing</a>
            <span>© {new Date().getFullYear()} RBS Labs</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
