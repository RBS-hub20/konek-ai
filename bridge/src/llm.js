import { config } from './config.js';
import { log } from './log.js';

/* ═══════════════════════════════════════════════════════════════════
   The half of the cascade that thinks.

   With the Realtime model the audio, the thinking and the speaking are
   one socket. With Deepgram listening, this is what answers: a streaming
   chat completion whose tokens go straight to Sonic, so the caller hears
   the first words while the rest is still being written.
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Streams one reply.
 *
 * @param messages  the conversation so far, system prompt first
 * @param onDelta   called with each text fragment as it arrives
 * @returns the complete reply
 */
export async function streamReply(messages, onDelta, { signal } = {}) {
  const res = await fetch(config.chatUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.openaiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.chatModel,
      messages,
      stream: true,
      /* A phone call is not an essay. Long replies are the single most
         common way a voice agent stops sounding like a person. */
      max_tokens: 160,
      temperature: 0.7,
    }),
    signal,
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Chat completion failed (${res.status}): ${detail.slice(0, 200)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    /* SSE frames are separated by a blank line, and a frame can arrive split
       across reads — so only whole frames are consumed. */
    let cut;
    while ((cut = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);
      for (const line of frame.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        try {
          const json = JSON.parse(data);
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) { full += delta; onDelta(delta); }
        } catch {
          /* A malformed frame is not worth dropping the call over. */
        }
      }
    }
  }

  return full;
}

/**
 * Keeps the conversation from growing without bound.
 *
 * The system prompt always survives; the oldest turns are dropped first,
 * because the end of a call is where the buying signals are.
 */
export function trimHistory(messages, maxTurns = 24) {
  if (messages.length <= maxTurns + 1) return messages;
  const [system, ...rest] = messages;
  const kept = rest.slice(-maxTurns);
  log.info('llm', `history trimmed to the last ${kept.length} turns`);
  return [system, ...kept];
}
