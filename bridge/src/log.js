import { config } from './config.js';

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const active = LEVELS[config.logLevel] ?? LEVELS.info;

const stamp = () => new Date().toISOString();

/* Keep the last few hundred lines in memory so a deployed bridge can be
   diagnosed over HTTP without shelling into the host. */
const RING = 400;
const recent = [];
export const recentLogs = (n = 200) => recent.slice(-n);

const emit = (level, scope, msg, extra) => {
  if (LEVELS[level] > active) return;
  const line = `${stamp()} [${level}] ${scope ? `(${scope}) ` : ''}${msg}`;
  const full = extra !== undefined ? `${line} ${safeJson(extra)}` : line;
  recent.push(full);
  if (recent.length > RING) recent.shift();
  if (extra !== undefined) console.log(line, extra);
  else console.log(line);
};

function safeJson(v) {
  try { return typeof v === 'string' ? v : JSON.stringify(v); } catch { return String(v); }
}

export const log = {
  error: (scope, msg, extra) => emit('error', scope, msg, extra),
  warn: (scope, msg, extra) => emit('warn', scope, msg, extra),
  info: (scope, msg, extra) => emit('info', scope, msg, extra),
  debug: (scope, msg, extra) => emit('debug', scope, msg, extra),
};
