import WebSocket from 'ws';
import { config, voiceForVibe, useCartesia } from './config.js';
import { log } from './log.js';
import { fetchCallConfig, reportCall } from './konek.js';
import { CartesiaStream } from './cartesia.js';

/* ═══════════════════════════════════════════════════════════════════
   One phone call.

   Twilio sends 8kHz mu-law audio as base64 over a websocket. OpenAI's
   realtime API speaks the same g711_ulaw format, so audio passes
   through in both directions with no resampling — which is what keeps
   latency low enough to feel like a conversation.

   The call stays up until someone hangs up or MAX_CALL_SECONDS is hit.
   ═══════════════════════════════════════════════════════════════════ */

export class CallSession {
  constructor(twilioWs) {
    this.twilio = twilioWs;
    this.openai = null;

    this.streamSid = null;
    this.callSid = null;
    this.params = {};

    this.startedAt = Date.now();
    this.closed = false;
    this.timeout = null;

    /** Everything said, in order, for the transcript. */
    this.transcript = [];

    /* Barge-in bookkeeping: how much assistant audio Twilio has actually
       played, so an interruption truncates at the right point. */
    this.assistantItemId = null;
    this.responseStartTimestamp = null;
    this.latestMediaTimestamp = 0;
    this.markQueue = [];

    /* Sonic, when TTS_PROVIDER=cartesia. Null means OpenAI speaks. */
    this.tts = null;
    this.ttsFailed = false;
    this.language = 'EN';

    this.twilio.on('message', (raw) => this.onTwilioMessage(raw));
    this.twilio.on('close', () => this.end('Completed'));
    this.twilio.on('error', (err) => {
      log.warn('twilio', `socket error: ${err.message}`);
      this.end('Failed');
    });
  }

  /* ── Twilio → us ─────────────────────────────────────────────── */

  onTwilioMessage(raw) {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    switch (msg.event) {
      case 'start':
        this.streamSid = msg.start?.streamSid ?? null;
        this.callSid = msg.start?.callSid ?? null;
        this.params = msg.start?.customParameters ?? {};
        log.info('call', `start ${this.callSid}`, this.params);
        this.connectOpenAI().catch((err) => {
          log.error('openai', `could not connect: ${err.message}`);
          this.end('Failed');
        });
        this.timeout = setTimeout(() => {
          log.warn('call', `${this.callSid} hit MAX_CALL_SECONDS`);
          this.end('Completed');
        }, config.maxCallSeconds * 1000);
        break;

      case 'media':
        this.latestMediaTimestamp = Number(msg.media?.timestamp ?? 0);
        if (this.openai?.readyState === WebSocket.OPEN && msg.media?.payload) {
          this.sendOpenAI({ type: 'input_audio_buffer.append', audio: msg.media.payload });
        }
        break;

      case 'mark':
        this.markQueue.shift();
        break;

      case 'stop':
        log.info('call', `stop ${this.callSid}`);
        this.end('Completed');
        break;

      default:
        break;
    }
  }

  /* ── OpenAI Realtime ─────────────────────────────────────────── */

  async connectOpenAI() {
    const callCfg = await fetchCallConfig({
      businessId: this.params.businessId,
      vibe: this.params.vibe,
      language: this.params.language,
      customerName: this.params.customerName,
    });
    this.callCfg = callCfg;

    this.language = callCfg.language ?? this.params.language ?? 'EN';

    /* Bring Sonic up before the model starts talking. If it cannot connect we
       fall back to OpenAI's own voice rather than leaving the caller silent. */
    if (useCartesia()) {
      try {
        this.tts = new CartesiaStream({
          language: this.language,
          onAudio: (b64) => this.playAudio(b64),
          onError: () => this.failoverToOpenAIVoice(),
        });
        await this.tts.connect();
      } catch (err) {
        log.warn('cartesia', `unavailable, using the OpenAI voice: ${err.message}`);
        this.tts = null;
        this.ttsFailed = true;
      }
    }

    const url = `${config.realtimeUrl}?model=${encodeURIComponent(config.realtimeModel)}`;
    const ws = new WebSocket(url, {
      headers: {
        Authorization: `Bearer ${config.openaiKey}`,
        'OpenAI-Beta': 'realtime=v1',
      },
    });
    this.openai = ws;

    ws.on('open', () => {
      log.info('openai', `connected (${config.realtimeModel}) for ${this.callSid}`);
      /* With Sonic speaking, the model only needs to produce text — asking it
         for audio as well would bill for a voice nobody hears. */
      const speaking = this.tts ? ['text'] : ['text', 'audio'];
      this.sendOpenAI({
        type: 'session.update',
        session: {
          /* g711_ulaw both ways = byte-for-byte compatible with Twilio. */
          input_audio_format: 'g711_ulaw',
          output_audio_format: 'g711_ulaw',
          voice: voiceForVibe(callCfg.voiceStyle),
          instructions: callCfg.systemPrompt,
          modalities: speaking,
          temperature: 0.8,
          /* Server-side voice activity detection gives natural turn-taking
             and lets the caller interrupt. */
          turn_detection: {
            type: 'server_vad',
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 600,
          },
          input_audio_transcription: { model: 'whisper-1' },
        },
      });

      /* Kai speaks first, with the tenant's own opener. */
      if (this.tts) this.tts.begin();
      this.sendOpenAI({
        type: 'response.create',
        response: {
          modalities: speaking,
          instructions: `Greet the customer with exactly this line, then continue the conversation naturally: "${callCfg.opener}"`,
        },
      });
    });

    ws.on('message', (raw) => this.onOpenAIMessage(raw));
    ws.on('close', (code) => {
      log.info('openai', `closed (${code}) for ${this.callSid}`);
      if (!this.closed) this.end('Completed');
    });
    ws.on('error', (err) => {
      log.error('openai', `socket error: ${err.message}`);
      this.end('Failed');
    });
  }

  onOpenAIMessage(raw) {
    let evt;
    try {
      evt = JSON.parse(raw.toString());
    } catch {
      return;
    }

    switch (evt.type) {
      /* Audio back to the caller. The event name changed between realtime
         API revisions, so accept both spellings. */
      case 'response.audio.delta':
      case 'response.output_audio.delta': {
        /* Sonic is speaking; ignore any audio the model still emits. */
        if (this.tts) break;
        if (!evt.delta) break;
        if (evt.item_id) this.assistantItemId = evt.item_id;
        this.playAudio(evt.delta);
        break;
      }

      /* Cartesia path: the model produces text, Sonic turns it into speech. */
      case 'response.text.delta':
      case 'response.output_text.delta': {
        if (!this.tts || !evt.delta) break;
        if (evt.item_id) this.assistantItemId = evt.item_id;
        this.tts.push(evt.delta);
        break;
      }

      /* The caller started talking over Kai — stop playback immediately. */
      case 'input_audio_buffer.speech_started':
        this.handleBargeIn();
        break;

      case 'response.audio_transcript.done':
      case 'response.output_audio_transcript.done':
        if (evt.transcript) this.addTranscript('KONEK', evt.transcript);
        break;

      /* Text-only mode reports what was said here instead. */
      case 'response.text.done':
      case 'response.output_text.done':
        if (this.tts && evt.text) this.addTranscript('KONEK', evt.text);
        break;

      case 'conversation.item.input_audio_transcription.completed':
        if (evt.transcript) this.addTranscript('Customer', evt.transcript);
        break;

      case 'response.done':
        /* Flush the tail of the reply so the last phrase is actually spoken. */
        if (this.tts) this.tts.end();
        this.responseStartTimestamp = null;
        this.assistantItemId = null;
        break;

      case 'error':
        log.error('openai', 'api error', evt.error ?? evt);
        break;

      default:
        log.debug('openai', `event ${evt.type}`);
        break;
    }
  }

  /** Writes one base64 mu-law chunk to Twilio and keeps the playhead bookkeeping. */
  playAudio(b64) {
    if (!this.streamSid) return;
    this.sendTwilio({ event: 'media', streamSid: this.streamSid, media: { payload: b64 } });
    if (this.responseStartTimestamp === null) {
      this.responseStartTimestamp = this.latestMediaTimestamp;
    }
    this.sendMark();
  }

  /** Sonic died mid-call — finish the call with OpenAI's voice instead. */
  failoverToOpenAIVoice() {
    if (!this.tts || this.ttsFailed) return;
    log.warn('cartesia', 'failing over to the OpenAI voice for the rest of this call');
    this.ttsFailed = true;
    try { this.tts.close(); } catch { /* already gone */ }
    this.tts = null;
    this.sendOpenAI({
      type: 'session.update',
      session: { modalities: ['text', 'audio'], output_audio_format: 'g711_ulaw' },
    });
  }

  /**
   * Barge-in. Twilio buffers audio ahead of playback, so on an interruption we
   * both clear its buffer and tell OpenAI how much of the reply was actually
   * heard — otherwise the model believes it said more than the caller heard.
   */
  handleBargeIn() {
    if (!this.markQueue.length || this.responseStartTimestamp === null) return;

    const heardMs = this.latestMediaTimestamp - this.responseStartTimestamp;
    if (this.assistantItemId) {
      this.sendOpenAI({
        type: 'conversation.item.truncate',
        item_id: this.assistantItemId,
        content_index: 0,
        audio_end_ms: Math.max(heardMs, 0),
      });
    }
    if (this.streamSid) this.sendTwilio({ event: 'clear', streamSid: this.streamSid });
    /* Abandon the current Sonic utterance so its tail cannot talk over them. */
    if (this.tts) this.tts.begin();

    this.markQueue = [];
    this.assistantItemId = null;
    this.responseStartTimestamp = null;
    log.debug('call', `barge-in after ${heardMs}ms`);
  }

  sendMark() {
    if (!this.streamSid) return;
    this.sendTwilio({ event: 'mark', streamSid: this.streamSid, mark: { name: 'chunk' } });
    this.markQueue.push('chunk');
  }

  addTranscript(speaker, text) {
    const line = text.trim();
    if (!line) return;
    this.transcript.push(`${speaker}: ${line}`);
    log.debug('transcript', `${speaker}: ${line.slice(0, 80)}`);
  }

  /* ── Plumbing ────────────────────────────────────────────────── */

  sendTwilio(obj) {
    if (this.twilio.readyState === WebSocket.OPEN) this.twilio.send(JSON.stringify(obj));
  }

  sendOpenAI(obj) {
    if (this.openai?.readyState === WebSocket.OPEN) this.openai.send(JSON.stringify(obj));
  }

  end(status) {
    if (this.closed) return;
    this.closed = true;
    if (this.timeout) clearTimeout(this.timeout);

    const durationSeconds = Math.round((Date.now() - this.startedAt) / 1000);
    log.info('call', `end ${this.callSid} after ${durationSeconds}s (${status})`);

    try { this.tts?.close(); } catch { /* already gone */ }
    try { this.openai?.close(); } catch { /* already gone */ }
    try { this.twilio?.close(); } catch { /* already gone */ }

    if (this.callSid) {
      /* A conversation that actually happened is worth more than "Completed". */
      const spoke = this.transcript.length > 1;
      reportCall({
        callSid: this.callSid,
        status: status === 'Completed' && spoke ? 'Connected' : status,
        durationSeconds,
        transcript: this.transcript.join('\n'),
      });
    }
  }
}
