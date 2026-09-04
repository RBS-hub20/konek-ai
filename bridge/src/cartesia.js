import WebSocket from 'ws';
import { config } from './config.js';
import { log } from './log.js';

/* ═══════════════════════════════════════════════════════════════════
   Cartesia Sonic text-to-speech.

   Sonic can emit raw 8 kHz mu-law, which is exactly what Twilio wants,
   so synthesized audio goes straight down the phone with no resampling.

   The voice is resolved by NAME at startup rather than hardcoded, so a
   renamed or re-issued voice id cannot silently break every call.
   ═══════════════════════════════════════════════════════════════════ */

const REST = 'https://api.cartesia.ai';

const headers = () => ({
  'X-API-Key': config.cartesiaKey,
  'Cartesia-Version': config.cartesiaVersion,
  'Content-Type': 'application/json',
});

let cachedVoice = null;
const voiceByLanguage = new Map();
let voiceLibrary = null;

/**
 * Walks the whole voice library. /voices is paginated, and the first page can
 * easily contain no English voices at all, so anything that only looks at page
 * one will fail to find the voice it was asked for.
 */
export async function fetchAllVoices(maxPages = 12) {
  const all = [];
  let startingAfter = null;

  for (let page = 0; page < maxPages; page++) {
    const url = new URL(`${REST}/voices/`);
    url.searchParams.set('limit', '100');
    if (startingAfter) url.searchParams.set('starting_after', startingAfter);

    const res = await fetch(url, { headers: headers(), signal: AbortSignal.timeout(12_000) });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`${res.status} ${body.slice(0, 200)}`);
    }
    const payload = await res.json();
    const batch = Array.isArray(payload) ? payload : (payload.data ?? []);
    if (!batch.length) break;
    all.push(...batch);

    const hasMore = Array.isArray(payload) ? batch.length === 100 : Boolean(payload.has_more);
    if (!hasMore) break;
    startingAfter = batch[batch.length - 1]?.id;
    if (!startingAfter) break;
  }
  return all;
}

const isEnglish = (v) => String(v.language ?? '').toLowerCase().startsWith('en');

/**
 * Finds the configured voice. An explicit CARTESIA_VOICE_ID wins; otherwise the
 * library is searched for CARTESIA_VOICE_NAME (default "Skylar"). If that name
 * does not exist on the account, any English voice is used rather than failing
 * the call — the fallback is logged so it is never a silent substitution.
 */
export async function resolveVoice() {
  if (cachedVoice) return cachedVoice;

  if (config.cartesiaVoiceId) {
    cachedVoice = { id: config.cartesiaVoiceId, name: '(from CARTESIA_VOICE_ID)', source: 'env' };
    return cachedVoice;
  }

  try {
    const voices = await fetchAllVoices();
    if (!voices.length) throw new Error('the voice library came back empty');

    const wanted = config.cartesiaVoiceName.trim().toLowerCase();
    const byName =
      voices.find((v) => String(v.name ?? '').toLowerCase() === wanted) ??
      voices.find((v) => String(v.name ?? '').toLowerCase().startsWith(wanted)) ??
      voices.find((v) => String(v.name ?? '').toLowerCase().includes(wanted));

    const english = voices.filter(isEnglish);
    const chosen = byName ?? english[0] ?? voices[0];

    cachedVoice = {
      id: chosen.id,
      name: chosen.name ?? 'unknown',
      language: chosen.language,
      source: byName
        ? `matched "${config.cartesiaVoiceName}"`
        : `"${config.cartesiaVoiceName}" is not on this account — using ${chosen.name}`,
      englishAvailable: english.length,
      totalVoices: voices.length,
    };
    log.info('cartesia', `voice: ${cachedVoice.name} (${cachedVoice.id}) — ${cachedVoice.source}`);
    if (!byName) {
      log.warn('cartesia', `set CARTESIA_VOICE_NAME or CARTESIA_VOICE_ID to pick deliberately; ${english.length} English voices available`);
    }
    return cachedVoice;
  } catch (err) {
    log.error('cartesia', `could not resolve a voice: ${err.message}`);
    return null;
  }
}

/** For diagnostics: the voice library, optionally filtered by language. */
export async function listVoices({ limit = 60, language = null, search = null } = {}) {
  let voices = await fetchAllVoices();
  if (language) voices = voices.filter((v) => String(v.language ?? '').toLowerCase().startsWith(language.toLowerCase()));
  if (search) {
    const q = search.toLowerCase();
    voices = voices.filter((v) => String(v.name ?? '').toLowerCase().includes(q));
  }
  return {
    total: voices.length,
    voices: voices.slice(0, limit).map((v) => ({ id: v.id, name: v.name, language: v.language })),
  };
}

/* ── Prosody shaping ─────────────────────────────────────────────── */

/**
 * Sonic takes its breathing from punctuation, so the model's own commas and
 * full stops do most of the work. This only fixes what would otherwise be read
 * badly, and stays deliberately conservative: a comma in the wrong place makes
 * speech worse than no comma at all, and Tagalog "po" usually sits mid-phrase
 * where a pause would be wrong.
 */
export function shapeForSpeech(text, language = 'EN') {
  let t = String(text).replace(/\s+/g, ' ').trim();
  if (!t) return t;

  /* A greeting followed straight by a name is the one place a Filipino speaker
     reliably breathes: "Hi po Renmar" -> "Hi po, Renmar". Anchored to the
     start so it cannot fire mid-sentence. */
  if (language === 'TL' || language === 'TAGLISH') {
    t = t.replace(/^((?:hi|hello|hey|magandang (?:umaga|hapon|gabi|araw))\s+(?:po|ho))\s+(?=[A-Z])/i, '$1, ');
  }

  /* Ranges are read as a subtraction otherwise: "2500-12800" -> "2500 to 12800". */
  t = t.replace(/(\d)\s*[-–]\s*(\d)/g, '$1 to $2');

  /* Tidy anything doubled up, and never leave a space before punctuation. */
  t = t.replace(/,\s*,/g, ',').replace(/\s+([,.?!])/g, '$1');

  /* Without a terminal mark Sonic clips the last word. */
  if (!/[.?!…]$/.test(t)) t += '.';
  return t;
}

/* ── Streaming synthesis ─────────────────────────────────────────── */

/**
 * One synthesis stream for one call. Text arrives in pieces as the model
 * generates it; audio comes back as base64 mu-law and is handed to `onAudio`.
 *
 * Every chunk is tagged with the generation it belongs to. On barge-in the
 * generation is bumped, and late audio from the abandoned reply is dropped
 * instead of talking over the caller.
 */
export class CartesiaStream {
  constructor({ language = 'EN', model = null, omitLanguage = false, onAudio, onError }) {
    this.language = language;
    this.model = model || modelForLanguage(language);
    /* Sonic's `language` field takes a fixed set of codes. A voice that speaks
       a language outside that set still works — you just must not name the
       language, and let the voice imply it. */
    this.omitLanguage = omitLanguage;
    /* Voice controls are dropped one at a time if the API rejects them, the
       same way the language field is, so an unsupported knob costs a retry
       rather than the whole utterance. */
    this.omitSpeed = false;
    this.omitEmotion = false;
    this.lastTranscript = '';
    this.onAudio = onAudio;
    this.onError = onError;
    this.ws = null;
    this.ready = false;
    this.voice = null;
    this.generation = 0;
    this.contextId = null;
    this.pending = '';
    this.queue = [];
  }

  async connect() {
    this.voice = await resolveVoiceFor(this.language);
    if (!this.voice) throw new Error(`no Cartesia voice available for ${this.language}`);

    const url =
      `${config.cartesiaWsUrl}?api_key=${encodeURIComponent(config.cartesiaKey)}` +
      `&cartesia_version=${encodeURIComponent(config.cartesiaVersion)}`;

    await new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      this.ws = ws;
      const timer = setTimeout(() => reject(new Error('Cartesia connect timed out')), 10_000);

      ws.on('open', () => {
        clearTimeout(timer);
        this.ready = true;
        log.info('cartesia', `connected (${config.cartesiaModel}, voice ${this.voice.name})`);
        resolve();
      });
      ws.on('message', (raw) => this.onMessage(raw));
      ws.on('error', (err) => {
        clearTimeout(timer);
        this.ready = false;
        log.error('cartesia', `socket error: ${err.message}`);
        this.onError?.(err);
        reject(err);
      });
      ws.on('close', (code) => {
        this.ready = false;
        log.info('cartesia', `closed (${code})`);
      });
    });
  }

  onMessage(raw) {
    let evt;
    try {
      evt = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (evt.type === 'chunk' && evt.data) {
      /* Ignore audio for a reply the caller already interrupted. */
      if (evt.context_id && evt.context_id !== this.contextId) return;
      this.onAudio?.(evt.data);
      return;
    }
    if (evt.type === 'error') {
      const message = String(evt.error ?? JSON.stringify(evt).slice(0, 200));

      /* Retry once without the language field rather than losing the utterance:
         the voice already carries its own language. */
      if (/invalid language/i.test(message) && !this.omitLanguage) {
        this.omitLanguage = true;
        log.warn('cartesia', `"${this.voice?.code}" is not an accepted language code — retrying with the voice's own language`);
        if (this.lastTranscript) this.send(this.lastTranscript, false);
        return;
      }

      if (/speed/i.test(message) && !this.omitSpeed) {
        this.omitSpeed = true;
        log.warn('cartesia', 'speed control rejected — retrying without it');
        if (this.lastTranscript) this.send(this.lastTranscript, false);
        return;
      }
      if (/emotion|control/i.test(message) && !this.omitEmotion) {
        this.omitEmotion = true;
        log.warn('cartesia', 'emotion control rejected — retrying without it');
        if (this.lastTranscript) this.send(this.lastTranscript, false);
        return;
      }

      log.error('cartesia', `api error: ${message}`);
      this.onError?.(new Error(message));
      return;
    }
    if (evt.type === 'done') {
      log.debug('cartesia', 'utterance done');
    }
  }

  /** Starts a fresh utterance; anything still playing is abandoned. */
  begin() {
    this.generation += 1;
    this.contextId = `ctx-${this.generation}-${Date.now().toString(36)}`;
    this.pending = '';
  }

  /** Buffers model text and flushes it at natural boundaries. */
  push(delta) {
    if (!this.ready) return;
    this.pending += delta;
    /* Flush on sentence ends, or when the buffer is long enough that waiting
       would be heard as a gap. */
    const boundary = /[.?!…,]\s|[.?!…]$/.test(this.pending);
    if (boundary || this.pending.length >= 90) this.flush(true);
  }

  flush(more) {
    const text = this.pending.trim();
    this.pending = '';
    if (!text || !this.ready) return;
    this.send(shapeForSpeech(text, this.language), more);
  }

  /** Signals the end of the reply so Sonic renders the final phrase. */
  end() {
    this.flush(false);
    if (this.ready && this.contextId) this.send('', false);
  }

  send(transcript, more) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.lastTranscript = transcript;
    const body = {
      model_id: this.model,
      transcript,
      voice: { mode: 'id', id: this.voice.id },
      output_format: {
        /* Twilio's native format — no resampling anywhere in the path. */
        container: 'raw',
        encoding: 'pcm_mulaw',
        sample_rate: 8000,
      },
      context_id: this.contextId,
      continue: Boolean(more),
      add_timestamps: false,
    };
    /* Named only when Sonic accepts the code; otherwise the voice implies it. */
    if (!this.omitLanguage) {
      body.language = this.voice.code ?? cartesiaLanguage(this.language);
    }

    /* Slightly under natural pace reads as considered rather than rushed,
       which is most of the difference between "robot" and "person". */
    if (config.cartesiaSpeed !== '' && !this.omitSpeed) {
      const n = Number(config.cartesiaSpeed);
      body.speed = Number.isFinite(n) ? n : config.cartesiaSpeed;
    }
    if (config.cartesiaEmotion.length && !this.omitEmotion) {
      body.voice.__experimental_controls = {
        emotion: config.cartesiaEmotion,
        ...(config.cartesiaSpeed !== '' && !this.omitSpeed ? { speed: config.cartesiaSpeed } : {}),
      };
    }
    try {
      this.ws.send(JSON.stringify(body));
    } catch (err) {
      log.warn('cartesia', `send failed: ${err.message}`);
    }
  }

  close() {
    try { this.ws?.close(); } catch { /* already gone */ }
    this.ready = false;
  }
}

/**
 * Which Sonic model to use. sonic-2 does not accept every language — Tagalog
 * and Arabic are rejected outright — so the model is selectable per language
 * rather than assumed to be universal.
 */
export function modelForLanguage(languageKey) {
  const code = cartesiaLanguage(languageKey);
  return config.modelByLanguage[code] ?? config.cartesiaModel;
}

/** KONEK language keys to Cartesia language codes. */
export function cartesiaLanguage(key) {
  switch (key) {
    case 'AR': return 'ar';
    case 'HI': return 'hi';
    /* Sonic does carry Tagalog voices, and a Tagalog voice handles the English
       words inside Taglish far better than an English voice handles Tagalog. */
    case 'TL': return config.langTl;
    case 'TAGLISH': return config.langTaglish;
    default: return 'en';
  }
}

/* A sensible warm, female-sounding default per language. Override any of them
   with CARTESIA_VOICE_<LANG>; a voice must exist in that language or Sonic
   rejects the request outright. */
const DEFAULT_VOICE_BY_LANG = {
  en: () => config.cartesiaVoiceName,
  tl: () => config.voiceTl,
  ar: () => config.voiceAr,
  hi: () => config.voiceHi,
};

/**
 * The voice to use for one call language. Sonic rejects a language its voice
 * does not speak, so the voice and the language code must be chosen together —
 * an English voice cannot simply be handed Arabic text.
 */
export async function resolveVoiceFor(languageKey) {
  const code = cartesiaLanguage(languageKey);
  if (voiceByLanguage.has(code)) return voiceByLanguage.get(code);

  /* An explicit id overrides everything, but only for its own language. */
  if (config.cartesiaVoiceId && code === 'en') {
    const pinned = { id: config.cartesiaVoiceId, name: '(from CARTESIA_VOICE_ID)', language: 'en', code };
    voiceByLanguage.set(code, pinned);
    return pinned;
  }

  try {
    voiceLibrary ??= await fetchAllVoices();
    const inLang = voiceLibrary.filter(
      (v) => String(v.language ?? '').toLowerCase() === code
    );

    if (!inLang.length) {
      /* No voice speaks it — fall back to English rather than failing the call,
         and say so, because the caller will hear the difference. */
      log.warn('cartesia', `no ${code} voice on this account; falling back to English for ${languageKey}`);
      const en = code === 'en' ? null : await resolveVoiceFor('EN');
      const result = en ? { ...en, code: 'en', fellBackFrom: code } : null;
      voiceByLanguage.set(code, result);
      return result;
    }

    const wanted = String(DEFAULT_VOICE_BY_LANG[code]?.() ?? '').trim().toLowerCase();
    const byName = wanted
      ? inLang.find((v) => String(v.name ?? '').toLowerCase() === wanted)
        ?? inLang.find((v) => String(v.name ?? '').toLowerCase().startsWith(wanted))
        ?? inLang.find((v) => String(v.name ?? '').toLowerCase().includes(wanted))
      : null;

    const chosen = byName ?? inLang[0];
    const result = {
      id: chosen.id,
      name: chosen.name,
      language: chosen.language,
      code,
      source: byName ? `matched "${wanted}"` : `"${wanted}" not found — using ${chosen.name}`,
      availableInLanguage: inLang.length,
    };
    voiceByLanguage.set(code, result);
    log.info('cartesia', `${languageKey} (${code}) -> ${result.name} — ${result.source}`);
    return result;
  } catch (err) {
    log.error('cartesia', `voice lookup failed for ${languageKey}: ${err.message}`);
    return null;
  }
}
