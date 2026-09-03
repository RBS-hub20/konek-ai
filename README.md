# KONEK AI — A Voice That Sells.

Universal AI Voice Calling Platform. One Next.js 14 project containing all three layers:

| Layer | Route | Who it is for |
| --- | --- | --- |
| Landing page | `/` | The market |
| Super Admin | `/super-admin` | RBS Labs (platform operators) |
| Business Owner Admin | `/admin` | Paying customers — the core product |

## Run it

```bash
cd KONEK-AI
npm install
npm run dev
```

Open http://localhost:3000

```bash
npm run build   # production build
npm run lint    # eslint
```

## Stack

- **Next.js 14** (App Router) + **TypeScript**
- **Tailwind CSS** — brand tokens as CSS variables, class-based dark mode
- **next-themes** — dark/light toggle, persisted to `localStorage`
- **Zustand** (`persist`) — vibe, active skills, custom skills, business brain, settings
- **Framer Motion** — entrances, modals, live feed
- **Lucide** — icons

All data is mock data in `lib/mockData.ts`. There is no backend call anywhere.

## Brand

| Token | Value |
| --- | --- |
| Pure Black | `#0F0F0F` |
| Pure White | `#FFFFFF` |
| Accent Blue | `#0A84FF` |
| Border | `#E5E5E5` |
| Gray | `#F5F5F5` |

Ultra minimal: thin 1px borders, 12px radius, generous whitespace, **no gradients, no shadows**.
Type is Inter (UI) + Sora (display), both via `next/font`.

### Logo

The official mark lives in `public/` and is used in every header, sidebar, loading screen and
as the favicon:

| File | Use |
| --- | --- |
| `logo.png` / `logo-white.png` | Full stacked lockup — loading screen, hero |
| `logo-mark.png` / `logo-mark-white.png` | Icon only — headers, sidebar |
| `logo-mark.svg` | Vector mark (`currentColor`) |
| `favicon.ico`, `apple-icon.png` | Browser tab / iOS |

The `-white` variants are the same artwork inverted, so the logo stays legible in dark mode.
`components/ui/Logo.tsx` swaps them automatically and exposes `sm` / `md` / `lg` sizes.

Brand assets are generated from vector geometry by `scripts/gen-logo.js`
(`node scripts/gen-logo.js`), so they can be re-rendered at any resolution.

## Structure

```
app/
  (marketing)/page.tsx     Landing page
  super-admin/page.tsx     RBS Labs console (dark)
  admin/page.tsx           Business owner dashboard (sidebar shell)
  layout.tsx  globals.css  providers.tsx
components/
  ui/                      Logo, Button, Card, Badge, Switch, Input,
                           Progress, Waveform, Tabs, StatCard,
                           ThemeToggle, LoadingScreen
  marketing/VoiceDemo.tsx  Hero player + vibe switcher
  admin/                   One component per dashboard tab
lib/
  mockData.ts              Skills, vibes, tenants, calls, pricing
  store.ts                 Zustand store
  utils.ts                 cn() + formatters
```

## The three layers

### Landing (`/`)
Nav (logo · theme toggle · Login · Get Started) → hero with an interactive voice demo player
(waveform + PRO CLOSER / FRIENDLY TITO / GEN-Z HYPE / CALM CARE switcher that rewrites the
script) → "Built on Cartesia Sonic + Chatterbox" → How It Works → Vibe Mode → use cases
(salon, Dubai real estate, clinics, e-commerce, crypto/FX, restaurants) → pricing
(Starter $49 / **Pro $149, Most Popular** / Enterprise) → footer CTA.

### Super Admin (`/super-admin`)
Dark by default and independent of the user's theme. Logo + `SUPER ADMIN` badge + system health
(Cartesia / Twilio / Deepgram). Tabs: **Overview** (MRR, active businesses, calls today, hot
leads; all-tenants table with usage progress bars and row actions; live global call feed with
animated waveforms), **Skills Analytics** (adoption of each ready-made skill across all
businesses), **Billing**, **Logs**.

### Business Owner Admin (`/admin`)
Sidebar (logo, 8 nav items, theme toggle at the bottom) + tabbed main area:

- **Overview** — calls today, connected %, hot leads (blue), bookings + recent calls
- **Campaigns** — audience/called/hot-lead progress per campaign
- **Business Brain** — business profile, drag-and-drop knowledge uploader (chips), goal selector
- **Skills Library** — 8 ready-made skills across SALES / SUPPORT / MARKETING, each with a
  toggle and a **Preview Script** modal, plus a **Custom Skill Builder**: describe a skill in
  plain English, name it, pick a trigger and vibe, generate a preview card, save it, then
  edit or delete it under *Your Custom Skills*
- **Vibe Mode** — four pills (selected = black on light / white on dark) with example scripts
- **Call Logs** — customer, phone, skills used (chips), vibe, duration, status (Hot Lead in
  blue), recording with play + waveform, transcript drawer
- **Integrations** — Twilio, Cartesia, Chatterbox, Deepgram, WhatsApp, HubSpot, Calendar, Stripe
- **Settings** — Twilio number, WhatsApp toggle, billing and usage

State persists across reloads via `localStorage`; clear the `konek-ai-store` key to reset.

---

© RBS Labs
 
