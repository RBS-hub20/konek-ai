import { env, hasCartesia } from '@/lib/env';
import { vibeToVoiceStyle, DEFAULT_VIBE } from './prompt';

/* Cartesia voice ids per vibe. Swap these for your own cloned voices —
   the ids below are the published Sonic English presets. */
const VIBE_VOICE_IDS: Record<string, string> = {
  'PRO CLOSER': 'a0e99841-438c-4a64-b679-ae501e7d6091',
  'FRIENDLY TITO': '79a125e8-cd45-4c13-8a67-188112f4dd22',
  'GEN-Z HYPE': '2ee87190-8f84-4925-97da-e52547f9462c',
  'CALM CARE': '156fb8d2-b182-4ab2-9c48-cf5c5c69b0ba',
};

export interface VoiceResult {
  /** Audio URL, or a data: URI when generated inline. */
  url: string;
  vibe: string;
  style: string;
  voiceId: string;
  mock: boolean;
  /** Present only on a real generation. */
  bytes?: number;
  error?: string;
}

/**
 * Turns text into speech in the requested vibe.
 * With CARTESIA_API_KEY set this calls Cartesia Sonic and returns a data: URI
 * of the WAV. Without it, returns a deterministic mock URL so the whole call
 * pipeline still runs end to end.
 */
export async function generateVoice(text: string, vibe: string = DEFAULT_VIBE): Promise<VoiceResult> {
  const style = vibeToVoiceStyle(vibe);
  const voiceId = VIBE_VOICE_IDS[vibe] ?? VIBE_VOICE_IDS[DEFAULT_VIBE];

  if (!hasCartesia) {
    const slug = vibe.toLowerCase().replace(/[^a-z]+/g, '-');
    return {
      url: `/mock-audio/${slug}-${hash(text)}.wav`,
      vibe,
      style,
      voiceId,
      mock: true,
    };
  }

  try {
    const res = await fetch('https://api.cartesia.ai/tts/bytes', {
      method: 'POST',
      headers: {
        'Cartesia-Version': '2024-06-10',
        'X-API-Key': env.cartesiaKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model_id: 'sonic-english',
        transcript: text,
        voice: { mode: 'id', id: voiceId },
        output_format: {
          container: 'wav',
          encoding: 'pcm_s16le',
          sample_rate: 16000,
        },
        language: 'en',
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Cartesia ${res.status}: ${detail.slice(0, 200)}`);
    }

    const buf = Buffer.from(await res.arrayBuffer());
    return {
      url: `data:audio/wav;base64,${buf.toString('base64')}`,
      vibe,
      style,
      voiceId,
      mock: false,
      bytes: buf.byteLength,
    };
  } catch (err) {
    /* Never let a TTS failure take down a call — fall back to the mock URL. */
    const slug = vibe.toLowerCase().replace(/[^a-z]+/g, '-');
    return {
      url: `/mock-audio/${slug}-${hash(text)}.wav`,
      vibe,
      style,
      voiceId,
      mock: true,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function hash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36).slice(0, 8);
}
