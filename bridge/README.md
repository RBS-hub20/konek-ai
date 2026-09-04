# KONEK AI — media-stream bridge

Turns a call from a 10-second spoken opener into a real two-way conversation.

Vercel functions cannot hold a websocket open, so this runs as its own
long-lived service. Twilio streams the caller's audio here; this bridges it to
OpenAI's realtime API and streams the reply back, until someone hangs up.

```
Twilio  ⇄  wss://<bridge>/media-stream  ⇄  OpenAI Realtime
                     │
                     └── GET  /api/call/config       (prompt, opener, voice)
                         POST /api/call/transcript   (result when the call ends)
```

Audio is 8 kHz mu-law in both directions — Twilio's native format and one
OpenAI accepts — so nothing is resampled and latency stays conversational.

---

## Deploy to Railway

1. [railway.app](https://railway.app) → **New Project → Deploy from GitHub repo**
   → pick `konek-ai`.
2. **Settings → Root Directory:** `bridge`
   (without this Railway builds the Next.js app instead.)
3. **Variables** — add three:

   | Variable | Value |
   | --- | --- |
   | `OPENAI_API_KEY` | the same key that is in Vercel |
   | `KONEK_API_SECRET` | **exactly** the same value as in Vercel |
   | `KONEK_APP_URL` | `https://konek-ai.vercel.app` |

   Optional: `OPENAI_REALTIME_MODEL` (default `gpt-realtime`),
   `MAX_CALL_SECONDS` (default `600`), `LOG_LEVEL=debug` while testing.

4. **Settings → Networking → Generate Domain.** Railway gives you something
   like `konek-ai-bridge-production.up.railway.app`.
5. Check it is alive:

   ```bash
   curl https://<your-railway-domain>/health
   ```

   ```jsonc
   { "ok": true, "openaiConfigured": true, "apiSecretConfigured": true }
   ```

6. Back in **Vercel → Settings → Environment Variables**, add:

   ```
   MEDIA_STREAM_URL = wss://<your-railway-domain>/media-stream
   ```

   `wss://`, not `https://`. Then **redeploy** — env changes do not apply to an
   existing deployment.

7. Confirm the app switched over:

   ```bash
   curl https://konek-ai.vercel.app/api/status | grep mediaBridge
   ```

Once `MEDIA_STREAM_URL` is set, `/api/call` emits
`<Connect><Stream>` instead of `<Say>`, and calls become conversations.
Remove the variable and it falls straight back to the spoken opener.

## Fly.io instead

```bash
cd bridge
fly launch --no-deploy          # fly.toml is already here
fly secrets set OPENAI_API_KEY=... KONEK_API_SECRET=... KONEK_APP_URL=https://konek-ai.vercel.app
fly deploy
```

`auto_stop_machines` is off in `fly.toml` — a stopped machine would drop a call
in progress.

## Run it locally

```bash
cd bridge
npm install
OPENAI_API_KEY=sk-... KONEK_API_SECRET=... KONEK_APP_URL=http://localhost:3000 npm start
```

To let Twilio reach it, expose it with `ngrok http 8080` and set
`MEDIA_STREAM_URL=wss://<ngrok-host>/media-stream`.

## What it does during a call

| Step | |
| --- | --- |
| `start` | reads `businessId`, `vibe`, `language` from the Twilio parameters |
| | fetches the system prompt and opener from `/api/call/config` |
| | opens the OpenAI realtime session with that prompt and a vibe-matched voice |
| | asks Kai to speak the opener first |
| `media` | forwards caller audio to OpenAI, streams the reply back to Twilio |
| barge-in | when the caller talks over Kai, clears Twilio's buffer and truncates the reply at what was actually heard |
| `stop` | posts the transcript, status and duration to `/api/call/transcript` |

## Troubleshooting

**Silence after the greeting** — check the Railway logs for `openai api error`.
The most common cause is `OPENAI_REALTIME_MODEL` naming; set it explicitly to
whatever realtime model your account has access to.

**"Could not fetch call config"** — `KONEK_API_SECRET` differs between Railway
and Vercel, or `KONEK_APP_URL` is wrong. The call still connects using a
generic fallback agent that states no business facts.

**Twilio connects then drops immediately** — `MEDIA_STREAM_URL` must be
`wss://`, and the Railway domain must be public.

**Call cuts off at 10 minutes** — that is `MAX_CALL_SECONDS`. Raise it.
