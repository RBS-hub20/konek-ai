import WebSocket from 'ws';
import { config, voiceForVibe, useCartesia } from './config.js';
import { log } from './log.js';
import { fetchCallConfig, reportCall, requestHandoff } from './konek.js';
import { CartesiaStream } from './cartesia.js';
import { LanguageTracker, detectHandoff, detectInterest } from './detect.js';

/* ═══════════════════════════════════════════════════════════════════
   One phone call.

   Twilio sends 8kHz mu-law audio as base64 over a websocket. OpenAI's
   realtime API speaks the same g711_ulaw format, so audio passes
   through in both directions with no resampling — which is what keeps
   latency low enough to feel like a conversation.

   The call stays up until someone hangs up or MAX_CALL_SECONDS is hit.
   ═══════════════════════════════════════════════════════════════════ */

export const SEEN_EVENTS = new Set();

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

    /* Auto language adaptation. The tracker only moves after two consecutive
       turns in a new language, or one explicit request. */
    this.tracker = null;
    this.autoLanguage = false;
    this.languagesUsed = new Set();
    this.switching = false;
    this.handingOff = false;
    /* Set from the Twilio parameters when this is KONEK selling itself. */
    this.outboundSales = false;

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
          this.lastError = err?.message ?? String(err);
          log.error('openai', `could not connect: ${this.lastError}`);
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
    this.stage = 'fetching call config';
    const callCfg = await fetchCallConfig({
      businessId: this.params.businessId,
      vibe: this.params.vibe,
      language: this.params.language,
      customerName: this.params.customerName,
      /* Set by the outbound TwiML. Whoever set the call up picked this
         script; without forwarding it the app falls back to the tenant's own
         receptionist prompt and the wrong script gets read. */
      scriptId: this.params.scriptId,
      company: this.params.company,
      contact: this.params.contact,
      industry: this.params.industry,
      country: this.params.country,
    });
    this.callCfg = callCfg;

    this.stage = 'resolving voice';
    this.language = callCfg.language ?? this.params.language ?? 'EN';
    this.startedLanguage = this.language;
    this.languagesUsed.add(this.language);

    /* The business setting decides; a Twilio parameter can override per call. */
    this.outboundSales = this.params.outbound === 'sales';
    if (this.outboundSales) log.info('sales', `outbound lead call: ${this.params.company ?? 'unknown company'}`);

    this.autoLanguage = this.params.autoLanguage != null
      ? this.params.autoLanguage === 'true'
      : Boolean(callCfg.autoLanguage);
    this.tracker = new LanguageTracker(this.language);
    if (this.autoLanguage) log.info('lang', `auto-detect on, starting in ${this.language}`);

    /* Bring Sonic up before the model starts talking. If it cannot connect we
       fall back to OpenAI's own voice rather than leaving the caller silent. */
    if (useCartesia()) {
      try {
        /* The script decides the pace. A phone line at 8 kHz is unforgiving,
           so a sales call runs slower than a conversational one. */
        const speed = this.params.speed
          ? Number(this.params.speed)
          : (callCfg.speed ?? null);

        this.tts = new CartesiaStream({
          language: this.language,
          speed: Number.isFinite(speed) && speed ? speed : null,
          onAudio: (b64) => this.playAudio(b64),
          onError: () => this.failoverToOpenAIVoice(),
        });
        if (speed) log.info('tts', `speed ${speed} for this call`);
        await this.tts.connect();
        this.stage = 'cartesia connected';
      } catch (err) {
        this.lastError = `cartesia: ${err?.message ?? err}`;
        log.warn('cartesia', `unavailable, using the OpenAI voice: ${err.message}`);
        this.tts = null;
        this.ttsFailed = true;
      }
    }

    this.stage = 'connecting to openai';
    const url = `${config.realtimeUrl}?model=${encodeURIComponent(config.realtimeModel)}`;
    /* The Realtime Beta shape is disabled on many accounts now
       (beta_api_shape_disabled), so the GA shape is the default and the beta
       header is only sent when explicitly asked for. */
    const beta = config.openaiApiShape === 'beta';
    const ws = new WebSocket(url, {
      headers: {
        Authorization: `Bearer ${config.openaiKey}`,
        ...(beta ? { 'OpenAI-Beta': 'realtime=v1' } : {}),
      },
    });
    this.betaShape = beta;
    this.openai = ws;

    ws.on('open', () => {
      this.stage = 'openai connected';
      log.info('openai', `connected (${config.realtimeModel}) for ${this.callSid}`);
      /* With Sonic speaking, the model only needs to produce text — asking it
         for audio as well would bill for a voice nobody hears. */
      const wantAudio = !this.tts;
      this.baseInstructions = callCfg.systemPrompt;
      const vad = {
        type: 'server_vad',
        threshold: config.vadThreshold,
        prefix_padding_ms: config.vadPrefixMs,
        silence_duration_ms: config.vadSilenceMs,
      };

      this.sendOpenAI(
        this.betaShape
          ? {
              type: 'session.update',
              session: {
                /* g711_ulaw both ways = byte-for-byte compatible with Twilio. */
                input_audio_format: 'g711_ulaw',
                output_audio_format: 'g711_ulaw',
                voice: voiceForVibe(callCfg.voiceStyle),
                instructions: callCfg.systemPrompt,
                modalities: wantAudio ? ['text', 'audio'] : ['text'],
                turn_detection: vad,
                input_audio_transcription: { model: 'whisper-1' },
              },
            }
          : {
              type: 'session.update',
              session: {
                type: 'realtime',
                instructions: callCfg.systemPrompt,
                output_modalities: wantAudio ? ['audio'] : ['text'],
                audio: {
                  input: {
                    /* audio/pcmu is GA's name for 8 kHz mu-law. */
                    format: { type: 'audio/pcmu' },
                    turn_detection: vad,
                    transcription: { model: 'whisper-1' },
                    ...(config.noiseReduction
                      ? { noise_reduction: { type: config.noiseReduction } }
                      : {}),
                  },
                  ...(wantAudio
                    ? { output: { format: { type: 'audio/pcmu' }, voice: voiceForVibe(callCfg.voiceStyle) } }
                    : {}),
                },
              },
            }
      );

      /* Kai speaks first, with the tenant's own opener. */
      if (this.tts) this.tts.begin();
      const opener = `Greet the customer with exactly this line, then continue the conversation naturally: "${callCfg.opener}"`;
      this.sendOpenAI(
        this.betaShape
          ? { type: 'response.create', response: { modalities: wantAudio ? ['text', 'audio'] : ['text'], instructions: opener } }
          : { type: 'response.create', response: { instructions: opener } }
      );
    });

    ws.on('message', (raw) => this.onOpenAIMessage(raw));
    ws.on('close', (code) => {
      log.info('openai', `closed (${code}) for ${this.callSid}`);
      if (!this.closed) this.end('Completed');
    });
    ws.on('error', (err) => {
      this.lastError = `openai: ${err.message}`;
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
        if (!evt.delta) break;
        if (!this.tts) { log.warn('bridge', 'text delta arrived but Sonic is not connected'); break; }
        if (evt.item_id) this.assistantItemId = evt.item_id;
        this.textDeltas = (this.textDeltas ?? 0) + 1;
        if (this.textDeltas === 1) log.info('bridge', 'first text delta -> Sonic');
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
        if (evt.transcript) {
          this.addTranscript('Customer', evt.transcript);
          /* Asking for a person beats everything else, including a language
             switch — so it is checked first. */
          if (this.considerHandoff(evt.transcript)) break;
          /* On a sales call, wanting it is reason enough to fetch a human. */
          if (this.outboundSales && this.considerInterest(evt.transcript)) break;
          if (this.autoLanguage) this.considerLanguage(evt.transcript);
        }
        break;

      case 'response.done':
        /* Flush the tail of the reply so the last phrase is actually spoken. */
        if (this.tts) this.tts.end();
        this.responseStartTimestamp = null;
        this.assistantItemId = null;
        break;

      case 'error': {
        const e = evt.error ?? evt;
        this.lastError = `openai: ${e.code ?? e.type ?? 'error'} — ${String(e.message ?? '').slice(0, 200)}`;
        log.error('openai', 'api error', e);
        break;
      }

      default:
        /* Record each event type once so a renamed delta event is obvious. */
        if (!SEEN_EVENTS.has(evt.type)) {
          SEEN_EVENTS.add(evt.type);
          log.info('openai', `first seen: ${evt.type}`);
        }
        break;
    }
  }

  /**
   * Moves the call to a human when the caller asks for one.
   *
   * Only the customer's own words count — Kai saying "I can put you through"
   * must not transfer the call.
   *
   * @returns true when a handoff is under way
   */
  considerHandoff(transcript) {
    if (this.handingOff) return true;
    const { wants, reason } = detectHandoff(transcript);
    if (!wants) return false;

    this.handingOff = true;
    log.info('handoff', `customer asked for a person ("${reason}")`);
    this.addTranscript('Customer', '[asked for a human]');

    void requestHandoff({
      callSid: this.callSid,
      businessId: this.params.businessId || undefined,
      language: this.language,
      reason,
    }).then((res) => {
      if (res?.transferred) {
        /* Twilio has taken the call away from us; the sockets close on their
           own, but end the session so it is reported as a handoff. */
        this.end('Handed off');
      } else {
        /* Nothing configured, or the transfer failed. Let Kai carry on rather
           than leaving the caller with silence. */
        this.handingOff = false;
    /* Set from the Twilio parameters when this is KONEK selling itself. */
    this.outboundSales = false;
        log.warn('handoff', `continuing with Kai: ${res?.reason ?? 'unknown'}`);
        this.sendOpenAI({
          type: 'response.create',
          response: {
            instructions:
              'The customer asked to speak to a person and no transfer is available. Apologise briefly, say you will have a colleague call them back, take the best number and time, then continue.',
          },
        });
      }
    });

    return true;
  }

  /**
   * Buying intent on an outbound sales call. The moment someone says yes, a
   * person should be closing — the AI has done its job.
   */
  considerInterest(transcript) {
    if (this.handingOff) return true;
    const { interested, reason } = detectInterest(transcript);
    if (!interested) return false;

    this.handingOff = true;
    log.info('sales', `interested ("${reason}") — fetching a human`);
    this.addTranscript('Customer', '[showed buying intent]');

    void requestHandoff({
      callSid: this.callSid,
      businessId: this.params.businessId || undefined,
      language: this.language,
      reason: `interested: ${reason}`,
    }).then((res) => {
      if (res?.transferred) {
        this.end('Handed off');
      } else {
        this.handingOff = false;
        log.warn('sales', `no human available: ${res?.reason ?? 'unknown'}`);
        this.sendOpenAI({
          type: 'response.create',
          response: {
            instructions:
              'They are interested but no one is free to take the call. Say a colleague will call them right back, confirm the best number and time, and thank them warmly.',
          },
        });
      }
    });

    return true;
  }

  /**
   * Adapts to the caller's language mid-call.
   *
   * The switch is deliberately unannounced — a person who starts replying in
   * English simply gets English back, they do not get told about it.
   */
  considerLanguage(transcript) {
    if (!this.tracker || this.switching) return;
    const { switched, to, explicit } = this.tracker.observe(transcript);
    if (!switched || to === this.language) return;

    log.info('lang', `${this.language} -> ${to}${explicit ? ' (asked for it)' : ''}`);
    void this.switchLanguage(to, explicit);
  }

  async switchLanguage(lang, explicit) {
    this.switching = true;
    const previous = this.language;
    try {
      /* Sonic needs a voice that speaks the new language, so the stream is
         rebuilt rather than retuned. */
      if (this.tts) {
        const next = new CartesiaStream({
          language: lang,
          speed: this.tts?.speed ?? null,
          onAudio: (b64) => this.playAudio(b64),
          onError: () => this.failoverToOpenAIVoice(),
        });
        await next.connect();
        const old = this.tts;
        this.tts = next;
        try { old.close(); } catch { /* already gone */ }
      }

      this.language = lang;
      this.languagesUsed.add(lang);

      /* Tell the model to follow, without telling the caller. */
      this.sendOpenAI({
        type: 'session.update',
        session: this.betaShape
          ? { instructions: `${this.baseInstructions}

## LANGUAGE NOW
The customer is speaking ${lang}. Reply in ${lang} from now on. Do not mention the change or apologise for it — just continue naturally.` }
          : { type: 'realtime', instructions: `${this.baseInstructions}

## LANGUAGE NOW
The customer is speaking ${lang}. Reply in ${lang} from now on. Do not mention the change or apologise for it — just continue naturally.` },
      });

      log.info('lang', `now speaking ${lang}${this.tts ? ` as ${this.tts.voice?.name}` : ''}`);
    } catch (err) {
      /* Keep the call in the language that still works. */
      this.language = previous;
      log.warn('lang', `could not switch to ${lang}: ${err.message}`);
    } finally {
      this.switching = false;
      void explicit;
    }
  }

  /** Writes one base64 mu-law chunk to Twilio and keeps the playhead bookkeeping. */
  playAudio(b64) {
    if (!this.streamSid) return;
    this.audioFrames = (this.audioFrames ?? 0) + 1;
    if (this.audioFrames === 1) log.info('bridge', `first audio frame out (${this.tts ? 'cartesia' : 'openai'})`);
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
        /* What they actually ended up speaking, not what was configured. */
        language: this.language,
        startedLanguage: this.startedLanguage,
        languagesUsed: Array.from(this.languagesUsed),
        languageSwitches: this.tracker?.switches ?? 0,
      });
    }
  }
}
