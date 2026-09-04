import http from 'node:http';
import { WebSocketServer } from 'ws';
import { config, assertConfig, useCartesia } from './config.js';
import { log, recentLogs } from './log.js';
import { CallSession, SEEN_EVENTS as SEEN_EVENT_TYPES } from './session.js';
import { EventEmitter } from 'node:events';
import { CartesiaStream, listVoices, resolveVoiceFor, shapeForSpeech } from './cartesia.js';

/* The Railway service: an HTTP server for health checks, with a websocket
   endpoint at /media-stream that Twilio connects each live call to. */

assertConfig();

const started = Date.now();
let activeCalls = 0;
let totalCalls = 0;

const json = (res, code, body) => {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body, null, 2));
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);

  /* Recent log lines, for diagnosing a deployed bridge. Behind the shared
     secret because prompts and transcripts pass through the logs. */
  if (url.pathname === '/logs') {
    const key = req.headers['x-konek-key'] ?? url.searchParams.get('key');
    if (!config.apiSecret || key !== config.apiSecret) {
      return json(res, 401, { error: 'x-konek-key required' });
    }
    return json(res, 200, { lines: recentLogs(Number(url.searchParams.get('n') ?? 200)) });
  }

  /* Which voices this account can use — for picking a better one by name. */
  if (url.pathname === '/voices') {
    if (!config.cartesiaKey) return json(res, 400, { error: 'CARTESIA_API_KEY is not set' });
    try {
      return json(res, 200, await listVoices({
        limit: Number(url.searchParams.get('limit') ?? 60),
        language: url.searchParams.get('language'),
        search: url.searchParams.get('search'),
      }));
    } catch (err) {
      return json(res, 502, { error: 'Could not list voices', detail: err.message });
    }
  }

  /* Runs the REAL call path against a stub Twilio socket and reports what
     happened. Counts and event names only — no prompt or transcript text —
     so it is safe to expose without the shared secret. */
  if (url.pathname === '/call-probe') {
    const language = (url.searchParams.get('language') ?? 'TAGLISH').toUpperCase();
    const seconds = Math.min(Number(url.searchParams.get('seconds') ?? 12), 25);
    try {
      return json(res, 200, await callProbe(language, seconds));
    } catch (err) {
      return json(res, 502, { error: err.message });
    }
  }

  /* Synthesizes one phrase end to end. The fastest way to prove Sonic works
     without placing a call, and it reports the real error when it does not. */
  if (url.pathname === '/tts-check') {
    if (!config.cartesiaKey) return json(res, 400, { error: 'CARTESIA_API_KEY is not set' });
    const language = (url.searchParams.get('language') ?? 'TAGLISH').toUpperCase();
    const phrase = url.searchParams.get('text')
      ?? 'Hi po Renmar, si Kai to from Nova Aesthetics. May quick question lang po ako.';
    try {
      const result = await ttsCheck(
        phrase, language, url.searchParams.get('model'), url.searchParams.get('nolang') === '1'
      );
      return json(res, result.bytes > 0 ? 200 : 502, result);
    } catch (err) {
      return json(res, 502, { ok: false, error: err.message, hint: 'Check CARTESIA_API_KEY, CARTESIA_MODEL and the voice name.' });
    }
  }

  if (url.pathname === '/health' || url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        ok: true,
        service: 'konek-ai-bridge',
        uptimeSeconds: Math.round((Date.now() - started) / 1000),
        activeCalls,
        totalCalls,
        model: config.realtimeModel,
        tts: {
          provider: useCartesia() ? 'cartesia' : 'openai',
          requested: config.ttsProvider,
          cartesiaModel: config.cartesiaModel,
          voiceName: config.cartesiaVoiceName,
          voiceResolved: resolvedVoiceName,
          checkWith: '/tts-check',
        },
        appUrl: config.appUrl,
        maxCallSeconds: config.maxCallSeconds,
        /* Never echo the keys themselves. */
        openaiConfigured: Boolean(config.openaiKey),
        cartesiaConfigured: Boolean(config.cartesiaKey),
        apiSecretConfigured: Boolean(config.apiSecret),
      })
    );
    return;
  }

  json(res, 404, { error: 'Not found', try: ['/health', '/voices', '/tts-check', 'wss://<host>/media-stream'] });
});

/**
 * A stand-in for Twilio's websocket: accepts the events CallSession sends and
 * counts the audio it would have played down the phone.
 */
class StubTwilio extends EventEmitter {
  constructor() {
    super();
    this.readyState = 1; // OPEN
    this.frames = 0;
    this.bytes = 0;
    this.firstFrameMs = null;
    this.started = Date.now();
  }
  send(raw) {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (m.event === 'media' && m.media?.payload) {
      if (this.firstFrameMs === null) this.firstFrameMs = Date.now() - this.started;
      this.frames += 1;
      this.bytes += Buffer.from(m.media.payload, 'base64').length;
    }
  }
  close() { this.readyState = 3; this.emit('close'); }
}

async function callProbe(language, seconds) {
  const stub = new StubTwilio();
  const session = new CallSession(stub);

  stub.emit('message', Buffer.from(JSON.stringify({
    event: 'start',
    start: {
      streamSid: 'MZprobe', callSid: `CAprobe-${Date.now()}`,
      customParameters: { businessId: '', vibe: 'PRO_CLOSER', language, customerName: 'RENMAR' },
    },
  })));

  /* Feed silence so the model is not waiting on an empty input buffer. */
  let n = 0;
  const feed = setInterval(() => {
    stub.emit('message', Buffer.from(JSON.stringify({
      event: 'media',
      media: { timestamp: String(n++ * 20), payload: Buffer.alloc(160, 0xff).toString('base64') },
    })));
  }, 20);

  await new Promise((r) => setTimeout(r, seconds * 1000));
  clearInterval(feed);

  const result = {
    language,
    ttsProvider: session.tts ? 'cartesia' : 'openai',
    cartesiaConnected: Boolean(session.tts?.ready),
    voice: session.tts?.voice ? { name: session.tts.voice.name, code: session.tts.voice.code, model: session.tts.model } : null,
    openaiEventsSeen: [...SEEN_EVENT_TYPES],
    textDeltas: session.textDeltas ?? 0,
    audioFramesOut: stub.frames,
    audioBytesOut: stub.bytes,
    approxSecondsOut: Number((stub.bytes / 8000).toFixed(2)),
    firstFrameMs: stub.firstFrameMs,
    ttsFailed: session.ttsFailed,
    stage: session.stage ?? 'not started',
    lastError: session.lastError ?? null,
    /* Diagnostic lines only — the transcript scope is excluded on purpose. */
    log: recentLogs(120).filter((l) => !l.includes('(transcript)')).slice(-25),
  };
  try { session.end('Completed'); } catch { /* already closed */ }
  return result;
}

/** Runs one short synthesis and counts the audio that comes back. */
function ttsCheck(phrase, language, model, omitLanguage) {
  return new Promise((resolve, reject) => {
    let bytes = 0;
    let chunks = 0;
    const stream = new CartesiaStream({
      language,
      model,
      omitLanguage,
      onAudio: (b64) => { chunks += 1; bytes += Buffer.from(b64, 'base64').length; },
      onError: (err) => { settle(() => reject(err)); },
    });

    let done = false;
    const settle = (fn) => { if (done) return; done = true; clearTimeout(timer); try { stream.close(); } catch {} fn(); };

    const timer = setTimeout(() => {
      settle(() =>
        resolve({
          ok: bytes > 0,
          bytes,
          chunks,
          language,
          spoken: shapeForSpeech(phrase, language),
          voice: stream.voice,
          model: stream.model,
          languageSent: stream.omitLanguage ? null : (stream.voice?.code ?? null),
          /* 8000 mu-law bytes is one second of phone audio. */
          approxSeconds: Number((bytes / 8000).toFixed(2)),
          ...(bytes === 0 ? { error: 'Connected but no audio came back — check the model id and voice.' } : {}),
        })
      );
    }, 9000);

    stream
      .connect()
      .then(() => {
        stream.begin();
        stream.push(phrase);
        stream.end();
      })
      .catch((err) => settle(() => reject(err)));
  });
}

/* Resolved once at boot so /health can show which voice calls will use. */
let resolvedVoiceName = null;
if (useCartesia()) {
  /* Warm the cache for every language the dashboard offers, so the first call
     in any language does not pay for the lookup. */
  Promise.all(['EN', 'TL', 'TAGLISH', 'AR', 'HI'].map((l) =>
    resolveVoiceFor(l).then((v) => [l, v ? `${v.name} [${v.code}]` : 'unresolved'])
  ))
    .then((pairs) => {
      resolvedVoiceName = Object.fromEntries(pairs);
      log.info('cartesia', 'voices ready', resolvedVoiceName);
    })
    .catch(() => { resolvedVoiceName = 'unresolved'; });
}

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const { pathname } = new URL(req.url ?? '/', `http://${req.headers.host}`);
  if (pathname !== '/media-stream') {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});

wss.on('connection', (ws) => {
  activeCalls += 1;
  totalCalls += 1;
  log.info('server', `media-stream connected (${activeCalls} active)`);

  const session = new CallSession(ws);
  ws.on('close', () => {
    activeCalls = Math.max(0, activeCalls - 1);
    log.info('server', `media-stream closed (${activeCalls} active)`);
  });
  void session;
});

server.listen(config.port, () => {
  log.info('server', `KONEK AI bridge listening on :${config.port}`);
  log.info('server', `realtime model: ${config.realtimeModel}`);
  log.info('server', `tts: ${useCartesia() ? `cartesia ${config.cartesiaModel} (${config.cartesiaVoiceName})` : 'openai realtime voice'}`);
  log.info('server', `app: ${config.appUrl}`);
  if (!config.apiSecret) {
    log.warn('server', 'KONEK_API_SECRET is not set — /api/call/config will be rejected by the app.');
  }
});

/* Railway sends SIGTERM on redeploy; let calls in flight finish. */
const shutdown = (signal) => {
  log.info('server', `${signal} — closing to new calls, ${activeCalls} still in flight`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 15_000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
