import http from 'node:http';
import { WebSocketServer } from 'ws';
import { config, assertConfig } from './config.js';
import { log } from './log.js';
import { CallSession } from './session.js';

/* The Railway service: an HTTP server for health checks, with a websocket
   endpoint at /media-stream that Twilio connects each live call to. */

assertConfig();

const started = Date.now();
let activeCalls = 0;
let totalCalls = 0;

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);

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
        appUrl: config.appUrl,
        maxCallSeconds: config.maxCallSeconds,
        /* Never echo the keys themselves. */
        openaiConfigured: Boolean(config.openaiKey),
        apiSecretConfigured: Boolean(config.apiSecret),
      })
    );
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found', try: ['/health', 'wss://<host>/media-stream'] }));
});

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
