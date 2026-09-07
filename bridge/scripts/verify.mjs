/* Boots the bridge for real and exercises it.
   `node --check` only parses; it cannot see that an import never landed, so
   a missing name stays invisible until a live call hits it. Three separate
   ReferenceErrors shipped that way — this is what catches the next one. */
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* assertConfig refuses to load server.js without this, and the point here is
   to check the names resolve, not to make real calls. */
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'verify';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(here, '..', 'src');
const PORT = process.env.VERIFY_PORT ?? '8099';
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log(`  ok   ${n}`); } else { fail++; console.log(`  FAIL ${n} ${x}`); } };

/* 1. Every module must load, and every name it uses must resolve. */
console.log('modules load');
for (const f of readdirSync(src).filter((f) => f.endsWith('.js'))) {
  try {
    await import(path.join(src, f));
    ok(f, true);
  } catch (err) {
    ok(f, false, err.message);
  }
}

/* 2. The server must boot and answer, and a probe call must run the real
      setup path — which is where an unimported name actually bites. */
console.log('\nserver boots and a probe call runs');
const proc = spawn(process.execPath, [path.join(src, 'server.js')], {
  env: { ...process.env, PORT, OPENAI_API_KEY: process.env.OPENAI_API_KEY || 'verify' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let out = '';
proc.stdout.on('data', (d) => { out += d; });
proc.stderr.on('data', (d) => { out += d; });

const base = `http://127.0.0.1:${PORT}`;
const wait = async () => {
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`${base}/health`); if (r.ok) return true; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
};

try {
  ok('server answers /health', await wait());

  const health = await (await fetch(`${base}/health`)).json();
  ok('health carries the stack block', Boolean(health.stack), JSON.stringify(health).slice(0, 120));
  ok('stack names an stt provider', typeof health.stack?.stt === 'string', health.stack?.stt);
  ok('stack names a tts provider', typeof health.stack?.tts === 'string', health.stack?.tts);
  ok('stack reports key presence', typeof health.stack?.stt_key_present === 'boolean');

  /* The probe drives a whole session: setup, config fetch, teardown and the
     end-of-call summary. It is the only cheap way to touch that path. */
  /* A crash here closes the socket mid-response, so the failure has to be
     caught rather than thrown — the log below is the whole point. */
  const probe = await fetch(`${base}/call-probe`).catch((err) => ({ ok: false, status: err.message }));
  ok('/call-probe answers', probe.ok, String(probe.status));

  await new Promise((r) => setTimeout(r, 2000));
  ok('server still alive after a probe call', await (async () => {
    try { return (await fetch(`${base}/health`)).ok; } catch { return false; }
  })());

  const calls = await fetch(`${base}/calls`).then((r) => r.json()).catch(() => null);
  ok('/calls answers', Array.isArray(calls?.calls));
  ok('the probe left a summary', (calls?.calls?.length ?? 0) >= 1, JSON.stringify(calls).slice(0, 160));

  const refErrors = [...out.matchAll(/(\w+) is not defined/g)].map((m) => m[1]);
  ok('no undefined names in the log', refErrors.length === 0, refErrors.join(', '));
} finally {
  proc.kill('SIGKILL');
}

if (fail) console.log(`\n--- server output ---\n${out.slice(-1500)}`);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
