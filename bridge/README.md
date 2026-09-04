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
2. **Settings → Root Directory:** type exactly `bridge` — no leading slash,
   no trailing slash. Without it Railway builds the Next.js app instead.

   Leave **Builder** on *Nixpacks* (the default). `bridge/nixpacks.toml` and
   `bridge/railway.json` pin the plan:

   ```
   install  npm install
   start    node src/server.js
   ```

   There is deliberately **no Dockerfile anywhere under `bridge/`** — Railway
   auto-detects one and uses it instead of Nixpacks, which conflicts with the
   declared builder and fails the image build in a couple of seconds.
3. **Variables** — add three:

   | Variable | Value |
   | --- | --- |
   | `OPENAI_API_KEY` | the same key that is in Vercel |
   | `KONEK_API_SECRET` | **exactly** the same value as in Vercel — without it the bridge cannot read `/api/call/config`, and Kai answers with no knowledge of your business |
   | `KONEK_APP_URL` | `https://konek-ai.vercel.app` |

   For Cartesia Sonic instead of the OpenAI voice, add:

   | Variable | Value |
   | --- | --- |
   | `TTS_PROVIDER` | `cartesia` |
   | `CARTESIA_API_KEY` | your Cartesia key |
   | `CARTESIA_MODEL` | `sonic-2` (default) |
   | `CARTESIA_VOICE_NAME` | `Skylar` (default) — looked up by name at boot |

   Optional: `CARTESIA_VOICE_ID` to pin an exact voice, `CARTESIA_SPEED`,
   `OPENAI_REALTIME_MODEL` (default `gpt-realtime`), `MAX_CALL_SECONDS`
   (default `600`), `LOG_LEVEL=debug` while testing.

4. **Settings → Networking → Generate Domain.** Railway gives you something
   like `konek-ai-bridge-production.up.railway.app`.
5. Check it is alive:

   ```bash
   curl https://<your-railway-domain>/health
   ```

   ```jsonc
   { "ok": true, "openaiConfigured": true, "apiSecretConfigured": true }
   ```

6. Back in **Vercel → Settings → Environment Variables**, add either:

   ```
   MEDIA_STREAM_URL      = wss://<your-railway-domain>/media-stream
   NEXT_PUBLIC_BRIDGE_URL = https://<your-railway-domain>
   ```

   Both are accepted — an `https://` base is converted to `wss://` and
   `/media-stream` is appended. `MEDIA_STREAM_URL` wins if both are set.
   Then **redeploy**; env changes do not apply to an existing deployment.

   If neither is set the app falls back to a built-in default pointing at
   `konek-ai-production.up.railway.app`, so calls keep working — but pin it
   explicitly so a Railway domain change cannot silently break dialling.

7. Confirm both halves can see each other — this checks from Vercel's own
   network and flags a mismatched secret or app URL:

   ```bash
   curl https://konek-ai.vercel.app/api/bridge/health
   ```

   ```jsonc
   { "reachable": true, "mediaStreamUrl": "wss://.../media-stream", "warnings": [] }
   ```

Once `MEDIA_STREAM_URL` is set, `/api/call` emits
`<Connect><Stream>` instead of `<Say>`, and calls become conversations.
Remove the variable and it falls straight back to the spoken opener.

## Fly.io instead

```bash
cd bridge
fly launch --no-deploy          # generates a Dockerfile; keep it out of git
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

## Text to speech

With `TTS_PROVIDER=cartesia` the pipeline changes shape. OpenAI still listens
and thinks, but stops speaking: the realtime session runs text-only and each
text fragment is streamed to Sonic, which returns 8 kHz mu-law — Twilio's own
format, so nothing is resampled.

```
caller audio ─► OpenAI realtime (STT + LLM, text out) ─► Cartesia Sonic ─► caller
```

Text is flushed to Sonic at sentence boundaries so speech starts before the
model has finished writing. On barge-in the utterance is abandoned and late
audio from it is dropped, so the tail of an interrupted sentence cannot talk
over the caller.

Two endpoints make this checkable without placing a call:

```bash
curl https://<bridge>/tts-check                    # synthesizes one Taglish line
curl https://<bridge>/tts-check?language=AR        # or Arabic
curl https://<bridge>/voices                       # what this account can use
```

`/tts-check` returns the bytes produced and roughly how many seconds of audio
that is. If Sonic is misconfigured it returns the actual Cartesia error.

**If Cartesia fails at any point the call does not drop** — the bridge logs the
reason and finishes with the OpenAI voice.

### Sounding human

Three things do the work, in order of impact:

1. **What the model writes.** Sonic speaks it verbatim, so the call prompt has
   a HOW TO SPEAK section — contractions, one or two sentences a turn,
   punctuation where a person breathes, numbers spoken not printed.
2. **Speed `0.95`** — a touch under natural pace reads as considered rather
   than rushed. `CARTESIA_SPEED`; `slow` also works and is noticeably slower.
3. **Emotion `positivity:high`** — warmth without sounding performed.
   `CARTESIA_EMOTION`, comma-separated.

Both controls are verified on this account in all five languages. They must
travel in **separate fields** — `speed` at the top level, `emotion` under the
voice's experimental controls. Sending speed in both places makes Sonic return
silence rather than an error, which is a miserable thing to debug. Check any
change with:

```bash
curl "https://<bridge>/tts-check?language=TAGLISH&speed=0.95&emotion=positivity:high"
```

### Pauses and pronunciation

Sonic breathes on punctuation, so the model's own commas do most of the work.
The bridge only fixes what would otherwise be read badly: it adds a comma after
a Taglish greeting particle when a name follows (`Hi po Renmar` → `Hi po,
Renmar`), reads number ranges as "2500 to 12800" rather than a subtraction, and
guarantees a terminal mark so the last word is not clipped. It deliberately does
not insert pauses around every `po` — mid-phrase `po` takes no pause, and a
comma in the wrong place sounds worse than none.

Sonic rejects a language its voice does not speak, so the voice and the
language code are chosen together. This account has 417 English, 49 Hindi, 15
Arabic and 8 Tagalog voices, so every language the dashboard offers has a
native voice:

Verified against this account with `/tts-check` — all five produce ~5s of
audio:

| Language | Code | Model | Default voice | Override |
| --- | --- | --- | --- | --- |
| English | `en` | `sonic-2` | Skylar - Friendly Guide | `CARTESIA_VOICE_NAME` |
| Tagalog | `tl` | `sonic-3` | Angel - Welcoming Host | `CARTESIA_VOICE_TL` |
| Taglish | `tl` | `sonic-3` | Angel - Welcoming Host | `CARTESIA_VOICE_TL` |
| Arabic | `ar` | `sonic-3` | Rania - Spirited Storyteller | `CARTESIA_VOICE_AR` |
| Hindi | `hi` | `sonic-3` | Ishani - Thoughtful Responder | `CARTESIA_VOICE_HI` |

**sonic-2 only speaks English here** — it rejects `tl`, `ar` and `hi` with
"Invalid language for model", so those default to `sonic-3`. Override any of
them with `CARTESIA_MODEL_TL`, `CARTESIA_MODEL_AR`, `CARTESIA_MODEL_HI`.
If a language code is ever refused, the stream resends the utterance without
the language field and lets the voice imply it, rather than losing the reply.

Taglish uses a Tagalog voice, which handles the English words inside a Taglish
sentence better than an English voice handles the Tagalog ones. Set
`CARTESIA_LANG_TAGLISH=en` to flip that.

Browse what is available with `/voices?language=tl` or `/voices?search=skylar`.

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

## If the Railway build fails

Read the first red line in **Deployments → the failed build → View logs**, then:

| What the log says | Fix |
| --- | --- |
| It is installing `next`, `react`, `tailwind` | Root Directory is not set. Set it to `bridge`. |
| `Dockerfile` / `failed to solve` | A Dockerfile is being detected. There should be none under `bridge/` at all — delete it and set the builder back to Nixpacks. |
| `npm ci` … `lock file` out of sync | `package-lock.json` is stale. Run `npm install` in `bridge/` and commit it. |
| `Cannot find module 'ws'` | The install phase was skipped. Check `railway.json` still has `buildCommand`. |
| Nothing obvious, fails in seconds | Settings → Build → turn **vulnerability scanning** off and redeploy. |

The build has no compile step, so almost every failure here is configuration
rather than code.
