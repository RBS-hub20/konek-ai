# KONEK AI — Backend

The backend lives inside the same Next.js app as route handlers under `app/api/`.
There is no separate server to deploy.

## The one thing to understand first

**Every endpoint works before you configure anything.** Each service is detected
independently, and when its keys are missing that part falls back to an in-memory
mock while the rest stays real:

| Service | Missing → | Configured → |
| --- | --- | --- |
| Supabase | In-memory data, resets on server restart | Real tables |
| OpenAI | Knowledge stored without vectors | Chunks embedded (1536-dim) |
| Twilio | Call recorded, nobody dialled | Real outbound call |
| Cartesia | Mock audio URL | Sonic TTS audio |
| Deepgram | Transcript only via the webhook | Live transcription |
| Stripe | Mock checkout URL | Real Checkout session |

`GET /api/status` tells you exactly what is live right now.

---

## 1 · Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. **SQL Editor → New query** → paste all of [`supabase.sql`](./supabase.sql) → **Run**.
   It enables `pgvector`, creates six tables, seeds the eight ready-made skills and
   adds the `match_business_brain()` similarity function. It is safe to re-run.
3. **Project Settings → API** and copy three values into `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

4. Restart the dev server. `GET /api/status` should now report `"mode": "live"`.

Create your first tenant:

```bash
curl -X POST http://localhost:3000/api/business \
  -H 'content-type: application/json' \
  -d '{"name":"Nova Aesthetics","owner_email":"you@example.com","plan":"pro","calls_limit":2000}'
```

> **Security note.** Row Level Security is deliberately left **off**. The API routes
> talk to Supabase with the service-role key, which bypasses RLS anyway. Before you
> let real tenants near this, turn RLS on for every table and add policies keyed to
> `auth.uid()` — otherwise the anon key can read every business's data.

## 2 · Environment keys

Fill in `.env.local` (already created, gitignored; `.env.example` is the committed copy).
Anything left as `your_...` counts as *not configured* and stays in mock mode.

## 3 · Twilio — and the key that gates it

```
TWILIO_ACCOUNT_SID=ACxxxx
TWILIO_AUTH_TOKEN=xxxx
TWILIO_PHONE_NUMBER=+1xxxxxxxxxx
KONEK_API_SECRET=<any long random string>
NEXT_PUBLIC_APP_URL=https://your-deployed-url
```

**As soon as Twilio credentials are present, `POST /api/call` refuses every request
that does not carry `x-konek-key: $KONEK_API_SECRET`** — and refuses outright if the
secret is unset. That endpoint dials real people and spends real money, so it must not
be open to the internet. In mock mode (no Twilio keys) no header is needed.

```bash
curl -X POST http://localhost:3000/api/call \
  -H 'content-type: application/json' \
  -H "x-konek-key: $KONEK_API_SECRET" \
  -d '{"customerPhone":"+639171234567","customerName":"Marco","vibe":"PRO CLOSER"}'
```

`NEXT_PUBLIC_APP_URL` must be publicly reachable for Twilio's stream and status
callbacks — use `ngrok http 3000` locally.

### Still to build for live audio

`/api/call` dials and hands Twilio a `<Stream>` pointing at `/api/call/stream`.
**That websocket endpoint does not exist yet.** Node route handlers cannot upgrade to
websockets, so the media bridge (Twilio audio ⇄ Deepgram STT ⇄ your LLM ⇄ Cartesia TTS)
needs a separate long-running websocket process. Everything up to that point — prompt
assembly, dialling, logging, transcripts — is wired.

## 4 · Testing without spending anything

```bash
# what's live
curl localhost:3000/api/status

# see the exact prompt the agent would run — dials nobody
curl -X POST localhost:3000/api/call \
  -H 'content-type: application/json' \
  -d '{"customerPhone":"+639171234567","dryRun":true}'
```

`dryRun` returns the fully assembled system prompt: identity → vibe → goal →
active skills → custom skills → Business Brain → guardrails.

---

## API reference

| Method & path | What it does |
| --- | --- |
| `GET /api/status` | Which integrations are live |
| `GET /api/skills?businessId=` | The 8 skills + this tenant's on/off state |
| `POST /api/skills` | `{skillId, enabled, businessId?}` — toggle one skill |
| `GET /api/business` | All tenants + platform stats (super admin) |
| `GET /api/business?current=1` | The current tenant |
| `POST /api/business` | Create a tenant (`name`, `owner_email` required) |
| `PATCH /api/business` | `{id, ...fields}` |
| `GET /api/custom-skills?businessId=` | Custom skills |
| `POST /api/custom-skills` | Compiles plain English into a skill prompt |
| `DELETE /api/custom-skills?id=` | Delete one |
| `POST /api/brain/upload` | `multipart` file, or JSON `{text}` / `{url}` |
| `GET /api/brain?businessId=` | Knowledge sources + chunk counts |
| `DELETE /api/brain?source=` | Remove a source |
| `GET /api/call?businessId=&limit=` | Call log |
| `POST /api/call` | Place a call (see gate above); `dryRun` to inspect the prompt |
| `POST /api/call/transcript` | Webhook — accepts Deepgram JSON *and* Twilio form posts |
| `GET/POST /api/stripe/checkout` | Plans / create a Checkout session |

## Knowledge extraction — what works today

`POST /api/brain/upload` chunks text (1200 chars, 150 overlap), embeds each chunk when
`OPENAI_API_KEY` is set, and stores it in `business_brain`.

- **Extracted:** `.txt .md .csv .json .html .yaml`, pasted text, and website URLs
  (fetched and stripped of tags).
- **Not extracted yet:** PDF and DOCX. They upload and appear as a source, and the
  response carries `extracted: false` plus a `warning`, but their contents are *not*
  searchable. Add `pdf-parse` / `mammoth` in `app/api/brain/upload/route.ts` where
  the `kind === 'pdf' | 'docx'` branch is marked.

## Files

```
lib/env.ts             Detects which services are configured
lib/supabase.ts        supabase + supabaseAdmin clients, db() helper
lib/types.ts           Row types
lib/apiClient.ts       Typed browser client for the routes
lib/server/repo.ts     One data API: Supabase when live, memory otherwise
lib/server/auth.ts     The call-API gate
lib/server/seed.ts     The 8 skills + demo tenant, mirroring supabase.sql
lib/ai/prompt.ts       buildSystemPrompt() — vibe, goal, skills, brain
lib/ai/voice.ts        generateVoice() — Cartesia Sonic or mock
lib/ai/embeddings.ts   embed() + chunkText()
supabase.sql           The schema
```

## Before production

- [ ] Turn on RLS and write policies
- [ ] Add real auth — the routes currently trust `businessId` from the caller, so any
      client can read or write any tenant by changing it. This is the biggest gap.
- [ ] Verify Twilio webhook signatures on `/api/call/transcript`
- [ ] Build the `/api/call/stream` websocket bridge
- [ ] Handle Stripe webhooks to actually change a tenant's plan on payment
- [ ] Swap in-memory fallback off in production so failures are loud, not silent
