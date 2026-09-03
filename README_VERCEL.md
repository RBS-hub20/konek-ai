# Deploying KONEK AI to Vercel

The app deploys as a standard Next.js project. **It builds and runs with zero
environment variables** — every unconfigured service falls back to mock mode, so
you can deploy first and add keys after.

---

## 1 · Push to GitHub

This folder is its own git repository with an initial commit already made.

```bash
cd KONEK-AI
git remote add origin https://github.com/<you>/konek-ai.git
git branch -M main
git push -u origin main
```

> If you would rather keep KONEK AI inside a larger repo, push the parent repo
> instead and set **Root Directory** to `KONEK-AI` in step 2.

## 2 · Import to Vercel

1. [vercel.com/new](https://vercel.com/new) → **Import Git Repository** → pick the repo.
2. Framework preset: **Next.js** (detected automatically from `vercel.json`).
3. Leave Build Command and Output Directory on their defaults.
4. **Root Directory:** leave as `./` — unless you pushed a parent repo, in which
   case set it to `KONEK-AI`.
5. **Deploy.**

The first deploy succeeds with no env vars set. It will run in mock mode.

## 3 · Add environment variables

**Project → Settings → Environment Variables.** Add each to *Production*,
*Preview* and *Development*, then **redeploy** — env changes do not apply to an
existing deployment.

### Required for real data

| Variable | Where to get it |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API (**secret**) |
| `NEXT_PUBLIC_APP_URL` | Your production URL, e.g. `https://konek.ai` |

Run [`supabase.sql`](./supabase.sql) in the Supabase SQL Editor first — see
[README_BACKEND.md](./README_BACKEND.md).

### Required for live calls

| Variable | Notes |
| --- | --- |
| `TWILIO_ACCOUNT_SID` | Twilio console |
| `TWILIO_AUTH_TOKEN` | Twilio console (**secret**) |
| `TWILIO_PHONE_NUMBER` | E.164, e.g. `+639170008642` |
| `KONEK_API_SECRET` | **Any long random string you invent** — see §5 |

### Optional

| Variable | Effect when absent |
| --- | --- |
| `CARTESIA_API_KEY` | Mock audio URL instead of Sonic TTS |
| `DEEPGRAM_API_KEY` | No live transcription (the webhook still works) |
| `OPENAI_API_KEY` | Knowledge stored without embeddings |
| `STRIPE_SECRET_KEY` | Mock checkout URL |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | — |

`.env.example` in the repo lists all of them with placeholders.

> **Do not** paste placeholder values like `your_supabase_url`. The app treats
> any value starting with `your_` as *not set* and stays in mock mode.

## 4 · Test the deployment

```bash
curl https://<your-app>.vercel.app/api/status
```

```jsonc
{
  "mode": "live",              // "mock" until Supabase is configured
  "supabase": "connected",
  "twilio": "live",
  "liveCallsEnabled": true,    // Twilio + KONEK_API_SECRET both present
  "appUrl": "https://konek.ai",
  "env": { "hasSupabaseUrl": true, "hasAnon": true, "hasServiceRole": true },
  "warnings": []               // anything misconfigured shows up here
}
```

`warnings` is the fastest way to find a missing or wrong variable. Then open
`/`, `/admin` and `/super-admin` in a browser.

## 5 · Protecting `/api/call`

`POST /api/call` dials real phone numbers and spends real money, so it is gated:

- **No Twilio credentials** → mock mode, endpoint is open, nobody is dialled.
- **Twilio set, `KONEK_API_SECRET` unset** → every request is refused with
  `503 {"error":"Set KONEK_API_SECRET to enable live calls"}`.
- **Both set** → requests must carry the key, or they get `401`.

```bash
curl -X POST https://<your-app>.vercel.app/api/call \
  -H 'content-type: application/json' \
  -H 'x-konek-key: <KONEK_API_SECRET>' \
  -d '{"customerPhone":"+639171234567","customerName":"Marco","vibe":"PRO CLOSER"}'
```

Generate a secret with `openssl rand -hex 32`. Keep it server-side — never put
it in client code or a `NEXT_PUBLIC_*` variable.

Add `dryRun: true` to see the assembled system prompt without dialling anyone.

## 6 · Custom domain

**Project → Settings → Domains → Add.** Enter `konek.ai`, then at your registrar:

| Record | Name | Value |
| --- | --- | --- |
| `A` | `@` | `76.76.21.21` |
| `CNAME` | `www` | `cname.vercel-dns.com` |

Vercel issues the TLS certificate automatically once DNS resolves (minutes to a
few hours). **Then update `NEXT_PUBLIC_APP_URL` to the new domain and redeploy**,
or Twilio callbacks and Stripe redirects keep pointing at the old URL.

---

## Things that will bite you

**Mock mode does not persist on Vercel.** Without Supabase the fallback store
lives in the memory of one serverless instance. Vercel may route the next request
to a different instance, so a skill you toggle can appear to revert. This is fine
for a click-through demo and *not* fine for a real demo to a customer — configure
Supabase before showing anyone.

**Function duration.** `vercel.json` sets `maxDuration: 30` for API routes. Hobby
plans cap lower than Pro; if a deploy complains, drop it to `10`.

**Env changes need a redeploy.** Adding a variable does nothing to a deployment
that is already built. Use **Deployments → ⋯ → Redeploy**.

**Preview deployments** get their own URL. With `NEXT_PUBLIC_APP_URL` unset the app
falls back to `VERCEL_URL` so previews are self-consistent, but Twilio webhooks
should always point at the production domain.

**There is still no live audio.** `/api/call` dials and hands Twilio a `<Stream>`
pointing at `/api/call/stream`, which does not exist — websockets need a
long-running process that Vercel serverless functions cannot provide. Run that
bridge on Railway, Fly.io or a container, and point the stream URL at it.

**No auth yet.** The API trusts `businessId` from the caller, so anyone can read
or write any tenant. Do not put real customer data in this until that is fixed.
