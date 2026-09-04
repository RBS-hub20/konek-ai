# KONEK AI v2 — multi-tenant, real data

The dashboard no longer contains mock data. Every screen reads and writes
Supabase. This is what to do to switch your live deployment over.

## 1 · Run the migration (required)

Supabase → **SQL Editor → New query** → paste all of
[`supabase.sql`](./supabase.sql) → **Run**.

It is idempotent and non-destructive on top of v1. One rename happens: the v1
`business_brain` table held RAG chunks, and v2 needs that name for the tenant
profile, so the chunk table becomes `brain_chunks` and keeps its rows.

It creates `campaigns`, `contacts`, `call_logs`, `business_integrations`, adds
`outbound_number` / `settings` / `active_vibe` to `businesses`, seeds the eight
skills with their preview scripts, and creates the public `knowledge` storage
bucket for uploads.

If `businesses` is empty it bootstraps one tenant on `+12232263852`.

## 2 · Unlocking live calls from the dashboard

`POST /api/call` spends money, so it is gated by `KONEK_API_SECRET` — which must
never ship in client code. The flow:

1. You press **Test call myself** (or **Start Calling**).
2. The server answers `401 { needsUnlock: true }`.
3. The dashboard shows an unlock dialog. You paste `KONEK_API_SECRET` once.
4. It is verified server-side and exchanged for a signed, httpOnly, 8-hour
   cookie. The secret itself is never stored in the browser.
5. Calls now go through for the rest of the session.

Server-to-server callers (including the campaign runner) keep using the
`x-konek-key` header instead.

## 3 · Try it

```bash
# what is live, per service AND per business
curl https://konek-ai.vercel.app/api/status

# see the exact prompt a call would run on — dials nobody
curl -X POST https://konek-ai.vercel.app/api/call \
  -H 'content-type: application/json' \
  -H "x-konek-key: $KONEK_API_SECRET" \
  -d '{"to":"+971501184402","dryRun":true}'
```

The dry run returns the assembled prompt: identity → vibe → what you sell and
your price range → goal → active skills → Business Brain → guardrails.

## What each screen now does

| Screen | Reads | Writes |
| --- | --- | --- |
| Overview | today's `call_logs`, campaigns, skills, brain | — |
| Campaigns | `campaigns` + `contacts` | create campaign, CSV/manual contacts, Start Calling |
| Business Brain | `business_brain` | profile UPSERT, uploads to Storage, goal |
| Skills Library | `skills` + `business_skills` | toggle per tenant, create/delete custom |
| Vibe Mode | `businesses.active_vibe` | saves vibe, places the test call |
| Call Logs | `call_logs` with filters | — |
| Integrations | `business_integrations` + server env | connect/disconnect |
| Settings | `businesses` | outbound number, channel toggles |
| Super Admin | all tenants, global `call_logs`, Twilio pool | create/suspend, buy & assign numbers |

## Known gaps

**Two-way conversation needs the bridge deployed.** `./bridge` is a standalone
websocket service (Railway or Fly) that connects Twilio's audio to OpenAI's
realtime API. Until `MEDIA_STREAM_URL` is set in Vercel, calls speak the opener
and hang up. See [bridge/README.md](./bridge/README.md).

**No authentication.** The API trusts `businessId` from the caller, so anyone who
finds the URL can read or write any tenant. `/super-admin` is not restricted to
your email — there is no identity to check it against. Add Supabase Auth before
real customers touch this.

**The dashboard is single-tenant.** It always operates on the first business row;
there is no tenant switcher, so super-admin "view dashboard" opens your own.

**Mock mode does not persist on Vercel.** Without Supabase the fallback store
lives in one serverless instance's memory. Run the migration.

**PDF and DOCX are stored but not read.** They upload to Storage and appear as
chips, but their text is not extracted, so the agent cannot answer from them.
Text, CSV, Markdown, JSON and website URLs work fully.

**Cartesia and Deepgram are not configured** on the current deployment, so the
call uses a Twilio Polly voice matched to the vibe, and transcripts only arrive
if you post them to `/api/call/transcript`.
