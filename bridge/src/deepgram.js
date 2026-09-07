import WebSocket from 'ws';
import { config } from './config.js';
import { log } from './log.js';

/* ═══════════════════════════════════════════════════════════════════
   Deepgram live transcription.

   Twilio hands us 8 kHz mu-law, which Deepgram takes directly — no
   resampling, no re-encoding, so the audio the caller made is the audio
   that gets transcribed.

   Two settings matter more than the rest:

     model=nova-3   nova-2 does not support Tagalog at all. Asking it for
                    Tagalog is how "sige, magkano ba?" comes back as
                    English words that sound vaguely similar.
     language=tl    Not `multi`, which is the tempting answer for Taglish
                    and the wrong one: measured on this account, `multi`
                    hears "Ah sige, magkano ba? May laundry kasi ako" as
                    Spanish. `tl` returns it verbatim and leaves the English
                    words inside it alone, which is what Taglish needs.
   ═══════════════════════════════════════════════════════════════════ */

const TERMINAL = new Set([1000, 1005, 1006]);

export class DeepgramStream {
  /**
   * @param onFinal      a completed utterance — the caller stopped talking
   * @param onInterim    partial text, used only to detect barge-in early
   * @param onSpeechStart the caller started talking over us
   */
  constructor({ language = 'EN', onFinal, onInterim, onSpeechStart, onError }) {
    this.language = language;
    this.onFinal = onFinal ?? (() => {});
    this.onInterim = onInterim ?? (() => {});
    this.onSpeechStart = onSpeechStart ?? (() => {});
    this.onError = onError ?? (() => {});
    this.ws = null;
    this.ready = false;
    /* Audio that arrived before the socket opened. A call starts talking
       immediately, and dropping the first second loses the greeting. */
    this.pending = [];
    this.closed = false;
  }

  url() {
    const q = new URLSearchParams({
      model: config.sttModel,
      language: this.dgLanguage(),
      /* Twilio's format, verbatim. */
      encoding: 'mulaw',
      sample_rate: '8000',
      channels: '1',
      interim_results: 'true',
      smart_format: 'true',
      punctuate: 'true',
      /* Deepgram's recommended endpointing for code-switching. */
      endpointing: String(config.sttEndpointingMs),
      utterance_end_ms: String(config.sttUtteranceEndMs),
      vad_events: 'true',
      filler_words: 'false',
    });
    return `${config.deepgramUrl}?${q.toString()}`;
  }

  /**
   * Our language keys are not Deepgram's.
   *
   * Taglish maps to `tl`, not `multi`. The reasoning that `multi` must be
   * right because Taglish mixes two languages is wrong in practice: nova-3's
   * Tagalog model already keeps English words it hears, and `multi` mangles
   * the Tagalog around them. Both measured through /stt-check.
   */
  dgLanguage() {
    const explicit = config.sttLanguage;
    if (explicit && explicit !== 'auto') return explicit;
    switch (String(this.language).toUpperCase()) {
      /* tl carries Taglish: it transcribes the Tagalog and leaves the
         English words in it alone. Verified with /stt-check. */
      case 'TL':
      case 'TAGLISH': return 'tl';
      case 'AR': return 'ar';
      case 'HI': return 'hi';
      default: return 'en';
    }
  }

  connect() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url(), {
        headers: { Authorization: `Token ${config.deepgramKey}` },
      });
      this.ws = ws;

      const fail = (err) => {
        if (this.ready) return;
        reject(err instanceof Error ? err : new Error(String(err)));
      };

      ws.on('open', () => {
        this.ready = true;
        log.info('stt', `Deepgram ${config.sttModel} open (language ${this.dgLanguage()})`);
        for (const chunk of this.pending) this.sendAudio(chunk);
        this.pending = [];
        resolve();
      });

      ws.on('message', (raw) => this.handle(raw));

      ws.on('error', (err) => {
        log.warn('stt', `Deepgram socket error: ${err.message}`);
        fail(err);
        if (this.ready) this.onError(err);
      });

      ws.on('close', (code, reason) => {
        this.ready = false;
        if (this.closed) return;
        const why = reason?.toString?.() || '';
        log.warn('stt', `Deepgram closed (${code}${why ? `: ${why}` : ''})`);
        fail(new Error(`Deepgram closed before opening (${code})`));
        if (!TERMINAL.has(code)) this.onError(new Error(`Deepgram closed: ${code}`));
      });

      setTimeout(() => fail(new Error('Deepgram did not connect in 8s')), 8000);
    });
  }

  handle(raw) {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    if (msg.type === 'SpeechStarted') { this.onSpeechStart(); return; }

    /* UtteranceEnd arrives when Deepgram is sure the turn is over, even if
       the last transcript was not marked final — the safety net for a caller
       who trails off rather than stopping cleanly. */
    if (msg.type === 'UtteranceEnd') { this.onFinal('', { utteranceEnd: true }); return; }

    if (msg.type !== 'Results') return;
    const alt = msg.channel?.alternatives?.[0];
    const text = (alt?.transcript ?? '').trim();
    if (!text) return;

    if (msg.is_final) {
      this.onFinal(text, {
        speechFinal: Boolean(msg.speech_final),
        confidence: alt?.confidence ?? null,
        /* Which languages Deepgram heard, for the language tracker. */
        languages: msg.channel?.languages ?? alt?.languages ?? null,
      });
    } else {
      this.onInterim(text);
    }
  }

  /** Twilio media payloads are already base64 mu-law. */
  sendAudio(b64) {
    if (!this.ready) { this.pending.push(b64); return; }
    try {
      this.ws.send(Buffer.from(b64, 'base64'));
    } catch (err) {
      log.warn('stt', `send failed: ${err.message}`);
    }
  }

  /** Tells Deepgram to flush whatever it is holding. */
  finalize() {
    if (!this.ready) return;
    try { this.ws.send(JSON.stringify({ type: 'Finalize' })); } catch { /* closing anyway */ }
  }

  close() {
    this.closed = true;
    try { this.ws?.send(JSON.stringify({ type: 'CloseStream' })); } catch { /* already gone */ }
    try { this.ws?.close(); } catch { /* already gone */ }
    this.ready = false;
  }
}

/**
 * One-shot transcription, for /stt-check.
 *
 * Takes raw audio bytes and returns what Deepgram makes of them, so the
 * Taglish question can be answered without dialling anybody.
 */
export async function transcribeOnce(bytes, { contentType = 'audio/wav', language = 'tl' } = {}) {
  const q = new URLSearchParams({
    model: config.sttModel,
    language,
    smart_format: 'true',
    punctuate: 'true',
  });
  const res = await fetch(`https://api.deepgram.com/v1/listen?${q}`, {
    method: 'POST',
    headers: { Authorization: `Token ${config.deepgramKey}`, 'Content-Type': contentType },
    body: bytes,
    signal: AbortSignal.timeout(30_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.err_msg || body?.error || `Deepgram returned ${res.status}`);
  }
  const alt = body.results?.channels?.[0]?.alternatives?.[0];
  return {
    transcript: alt?.transcript ?? '',
    confidence: alt?.confidence ?? null,
    detectedLanguages: body.results?.channels?.[0]?.detected_language
      ?? body.results?.channels?.[0]?.languages
      ?? null,
    model: config.sttModel,
    language,
  };
}
