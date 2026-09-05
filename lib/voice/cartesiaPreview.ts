import { env, hasCartesia } from '@/lib/env';

/* ═══════════════════════════════════════════════════════════════════
   Cartesia, for listening to in a browser.

   The bridge asks for 8 kHz mu-law because that is what a phone line
   carries. A browser is not a phone line: mu-law WAV plays in Chrome
   and silently fails elsewhere, which is why the preview button looked
   broken. Previews are MP3.
   ═══════════════════════════════════════════════════════════════════ */

const REST = 'https://api.cartesia.ai';
const VERSION = process.env.CARTESIA_VERSION?.trim() || '2024-06-10';

const headers = () => ({
  'X-API-Key': env.cartesiaKey,
  'Cartesia-Version': VERSION,
  'Content-Type': 'application/json',
});

/** Cartesia rejects a language its voice cannot speak, so they are chosen together. */
const LANGUAGE_PLAN: Record<string, { code: string; model: string; voiceName: string }> = {
  PH: { code: 'tl', model: 'sonic-3', voiceName: 'Angel' },
  TL: { code: 'tl', model: 'sonic-3', voiceName: 'Angel' },
  TAGLISH: { code: 'tl', model: 'sonic-3', voiceName: 'Angel' },
  AE: { code: 'en', model: 'sonic-2', voiceName: 'Skylar' },
  EN: { code: 'en', model: 'sonic-2', voiceName: 'Skylar' },
  AR: { code: 'ar', model: 'sonic-3', voiceName: 'Rania' },
  HI: { code: 'hi', model: 'sonic-3', voiceName: 'Ishani' },
};

export const planFor = (country?: string | null) =>
  LANGUAGE_PLAN[(country ?? 'EN').toUpperCase()] ?? LANGUAGE_PLAN.EN;

/* The voice library is paginated and its first page holds no English at all,
   so a lookup that reads one page finds nothing. */
const voiceCache = new Map<string, string>();

async function fetchAllVoices(maxPages = 12) {
  const all: { id: string; name?: string; language?: string }[] = [];
  let startingAfter: string | null = null;

  for (let page = 0; page < maxPages; page++) {
    const url = new URL(`${REST}/voices/`);
    url.searchParams.set('limit', '100');
    if (startingAfter) url.searchParams.set('starting_after', startingAfter);

    const res = await fetch(url, { headers: headers(), signal: AbortSignal.timeout(12_000) });
    if (!res.ok) throw new Error(`Cartesia voices ${res.status}: ${(await res.text().catch(() => '')).slice(0, 160)}`);
    const payload = await res.json();
    const batch = Array.isArray(payload) ? payload : (payload.data ?? []);
    if (!batch.length) break;
    all.push(...batch);
    const hasMore = Array.isArray(payload) ? batch.length === 100 : Boolean(payload.has_more);
    if (!hasMore) break;
    startingAfter = batch[batch.length - 1]?.id ?? null;
    if (!startingAfter) break;
  }
  return all;
}

export async function resolveVoiceId(voiceName: string, languageCode: string): Promise<string> {
  const key = `${voiceName}|${languageCode}`;
  const cached = voiceCache.get(key);
  if (cached) return cached;

  const voices = await fetchAllVoices();
  const inLang = voices.filter((v) => String(v.language ?? '').toLowerCase() === languageCode);
  const pool = inLang.length ? inLang : voices;
  const wanted = voiceName.toLowerCase();

  const chosen =
    pool.find((v) => String(v.name ?? '').toLowerCase() === wanted) ??
    pool.find((v) => String(v.name ?? '').toLowerCase().startsWith(wanted)) ??
    pool.find((v) => String(v.name ?? '').toLowerCase().includes(wanted)) ??
    pool[0];

  if (!chosen?.id) throw new Error(`No Cartesia voice found for ${voiceName} (${languageCode})`);
  voiceCache.set(key, chosen.id);
  return chosen.id;
}

export interface PreviewResult {
  audio: ArrayBuffer;
  contentType: string;
  voiceId: string;
  model: string;
  language: string;
}

/** Synthesizes one line as MP3, for playing in a browser. */
export async function previewSpeech({
  text, country, speed, emotion,
}: {
  text: string;
  country?: string | null;
  speed?: number | null;
  emotion?: string | null;
}): Promise<PreviewResult> {
  if (!hasCartesia) {
    throw new Error('CARTESIA_API_KEY is not set on this deployment — add it in Vercel and redeploy.');
  }

  const plan = planFor(country);
  const voiceId = await resolveVoiceId(plan.voiceName, plan.code);

  const voice: Record<string, unknown> = { mode: 'id', id: voiceId };
  /* Cartesia takes a small set of emotion tags; a label like
     "warm-professional" is ours, not theirs, so it is mapped. */
  const tag = mapEmotion(emotion);
  if (tag) voice.__experimental_controls = { emotion: [tag] };

  const body: Record<string, unknown> = {
    model_id: plan.model,
    transcript: text,
    voice,
    language: plan.code,
    output_format: { container: 'mp3', sample_rate: 44100, bit_rate: 128000 },
  };
  if (typeof speed === 'number' && speed > 0) body.speed = speed;

  const res = await fetch(`${REST}/tts/bytes`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Cartesia ${res.status}: ${detail.slice(0, 240)}`);
  }

  return {
    audio: await res.arrayBuffer(),
    contentType: 'audio/mpeg',
    voiceId,
    model: plan.model,
    language: plan.code,
  };
}

function mapEmotion(label?: string | null): string | null {
  switch ((label ?? '').toLowerCase()) {
    case 'warm-professional':
    case 'professional':
      return 'positivity:low';
    case 'warm':
    case 'friendly':
      return 'positivity:high';
    default:
      return null;
  }
}
