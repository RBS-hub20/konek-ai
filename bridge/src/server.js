import http from 'node:http';
import { WebSocketServer } from 'ws';
import { config, assertConfig, useCartesia } from './config.js';
import { log } from './log.js';
import { CallSession } from './session.js';
import { CartesiaStream, listVoices, resolveVoice, shapeForSpeech } from './cartesia.js';

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

  /* Which voices this account can use — for picking a better one by name. */
  if (url.pathname === '/voices') {
    if (!config.cartesiaKey) return json(res, 400, { error: 'CARTESIA_API_KEY is not set' });
    try {
      return json(res, 200, { voices: await listVoices(Number(url.searchParams.get('limit') ?? 40)) });
    } catch (err) {
      return json(res, 502, { error: 'Could not list voices', detail: err.message });
    }
  }

  /* Synthesizes one phrase end to end. The fastest way to prove Sonic works
     without placing a call, and it reports the real error when it does not. */
  if (url.pathname === '/tts-check') {
    if (!config.cartesiaKey) return json(res, 400, { error: 'CARTESIA_API_KEY is not set' });
    const language = url.searchParams.get('language') ?? 'TAGLISH';
    const phrase = url.searchParams.get('text')
      ?? 'Hi po Renmar, si Kai to from Nova Aesthetics. May quick question lang po ako.';
    try {
      const result = await ttsCheck(phrase, language);
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

/** Runs one short synthesis and counts the audio that comes back. */
function ttsCheck(phrase, language) {
  return new Promise((resolve, reject) => {
    let bytes = 0;
    let chunks = 0;
    const stream = new CartesiaStream({
      language,
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
          model: config.cartesiaModel,
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
  resolveVoice()
    .then((v) => {
      resolvedVoiceName = v ? `${v.name} (${v.id})` : 'unresolved';
      if (!v) log.error('cartesia', 'no voice resolved — calls will use the OpenAI voice');
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
