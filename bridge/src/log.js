import { config } from './config.js';

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const active = LEVELS[config.logLevel] ?? LEVELS.info;

const stamp = () => new Date().toISOString();

const emit = (level, scope, msg, extra) => {
  if (LEVELS[level] > active) return;
  const line = `${stamp()} [${level}] ${scope ? `(${scope}) ` : ''}${msg}`;
  if (extra !== undefined) console.log(line, extra);
  else console.log(line);
};

export const log = {
  error: (scope, msg, extra) => emit('error', scope, msg, extra),
  warn: (scope, msg, extra) => emit('warn', scope, msg, extra),
  info: (scope, msg, extra) => emit('info', scope, msg, extra),
  debug: (scope, msg, extra) => emit('debug', scope, msg, extra),
};
