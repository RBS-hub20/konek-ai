import http from 'node:http';
process.env.DEEPGRAM_API_KEY = 'test-key';
process.env.STT_PROVIDER = 'deepgram';
process.env.OPENAI_API_KEY = 'test';

const { DeepgramStream } = await import('../src/deepgram.js');
const { config, useDeepgram } = await import('../src/config.js');

let pass = 0, fail = 0;
const ok = (name, cond, extra='') => { if (cond) { pass++; console.log(`  ok   ${name}`); } else { fail++; console.log(`  FAIL ${name} ${extra}`); } };

console.log('config');
ok('useDeepgram true with key + provider', useDeepgram() === true);
ok('model defaults to nova-3 (nova-2 has no Tagalog)', config.sttModel === 'nova-3', config.sttModel);
ok('language defaults to auto (mapped per call)', config.sttLanguage === 'auto', config.sttLanguage);

console.log('url');
const s = new DeepgramStream({ language: 'TAGLISH' });
const u = new URL(s.url());
ok('encoding=mulaw', u.searchParams.get('encoding') === 'mulaw');
ok('sample_rate=8000', u.searchParams.get('sample_rate') === '8000');
ok('interim_results', u.searchParams.get('interim_results') === 'true');
ok('smart_format', u.searchParams.get('smart_format') === 'true');
ok('punctuate', u.searchParams.get('punctuate') === 'true');
ok('endpointing=100 for code-switching', u.searchParams.get('endpointing') === '100');
ok('vad_events on (barge-in)', u.searchParams.get('vad_events') === 'true');
ok('model nova-3', u.searchParams.get('model') === 'nova-3');
/* Measured, not assumed: multi returns Spanish for a Taglish line. */
ok('TAGLISH -> tl', u.searchParams.get('language') === 'tl', u.searchParams.get('language'));
ok('EN -> en', new URL(new DeepgramStream({ language: 'EN' }).url()).searchParams.get('language') === 'en');

console.log('event handling');
const seen = { interim: [], final: [], speech: 0 };
const t = new DeepgramStream({
  language: 'TAGLISH',
  onInterim: (x) => seen.interim.push(x),
  onFinal: (x, m) => seen.final.push([x, m]),
  onSpeechStart: () => seen.speech++,
});
t.handle(JSON.stringify({ type: 'SpeechStarted' }));
t.handle(JSON.stringify({ type: 'Results', is_final: false, channel: { alternatives: [{ transcript: 'ah sige' }] } }));
t.handle(JSON.stringify({ type: 'Results', is_final: true, speech_final: true, channel: { alternatives: [{ transcript: 'Ah sige, magkano ba?', confidence: 0.94 }] } }));
t.handle(JSON.stringify({ type: 'Results', is_final: true, channel: { alternatives: [{ transcript: '' }] } }));
t.handle(JSON.stringify({ type: 'UtteranceEnd' }));
t.handle('not json');
ok('SpeechStarted -> barge-in hook', seen.speech === 1);
ok('interim delivered', seen.interim.length === 1 && seen.interim[0] === 'ah sige');
ok('final delivered with speech_final', seen.final[0]?.[0] === 'Ah sige, magkano ba?' && seen.final[0][1].speechFinal === true);
ok('empty transcript ignored', seen.final.length === 2);
ok('UtteranceEnd flagged', seen.final[1]?.[1]?.utteranceEnd === true);
ok('malformed json survives', true);

console.log('audio buffering before open');
const b = new DeepgramStream({ language: 'EN' });
b.sendAudio('AAAA'); b.sendAudio('BBBB');
ok('audio queued while connecting', b.pending.length === 2);

console.log('llm sse streaming');
const srv = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  const frames = [
    'data: {"choices":[{"delta":{"content":"Sige"}}]}\n\n',
    'data: {"choices":[{"delta":{"content":" po"}}]}\n\ndata: {"choices":[{"delta":{"content":", "}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"magkano"}}]}\n\n',
    'data: [DONE]\n\n',
  ];
  // split a frame across two writes, which is what actually happens on a socket
  res.write(frames[0].slice(0, 12));
  res.write(frames[0].slice(12));
  res.write(frames[1]);
  res.write(frames[2]);
  res.write(frames[3]);
  res.end();
});
await new Promise((r) => srv.listen(0, r));
process.env.OPENAI_CHAT_URL = `http://127.0.0.1:${srv.address().port}/v1/chat`;
const { streamReply, trimHistory } = await import('../src/llm.js?fresh=1');
const cfg = (await import('../src/config.js')).config;
cfg.chatUrl = process.env.OPENAI_CHAT_URL;
const deltas = [];
const full = await streamReply([{ role: 'system', content: 'x' }], (d) => deltas.push(d));
ok('streams deltas in order', deltas.join('') === 'Sige po, magkano', JSON.stringify(deltas));
ok('returns the full reply', full === 'Sige po, magkano', full);
ok('handles a frame split across reads', deltas[0] === 'Sige');
srv.close();

const hist = [{ role: 'system', content: 'sys' }, ...Array.from({ length: 30 }, (_, i) => ({ role: 'user', content: `m${i}` }))];
const trimmed = trimHistory(hist, 10);
ok('trim keeps the system prompt first', trimmed[0].content === 'sys');
ok('trim keeps the newest turns', trimmed[trimmed.length - 1].content === 'm29' && trimmed.length === 11);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
