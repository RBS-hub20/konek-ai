import { env, hasOpenAI } from '@/lib/env';

const MODEL = 'text-embedding-3-small'; // 1536 dims, matches vector(1536)

/**
 * Embeds text for the Business Brain. Returns null when OPENAI_API_KEY is
 * absent — the row is still stored, just without a vector, and keyword
 * retrieval is used instead.
 */
export async function embed(text: string): Promise<number[] | null> {
  if (!hasOpenAI) return null;
  try {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: MODEL, input: text.slice(0, 8000) }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: { embedding: number[] }[] };
    return json.data?.[0]?.embedding ?? null;
  } catch {
    return null;
  }
}

/** Splits long documents so each chunk embeds cleanly. */
export function chunkText(text: string, size = 1200, overlap = 150): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= size) return clean ? [clean] : [];
  const chunks: string[] = [];
  let i = 0;
  while (i < clean.length) {
    chunks.push(clean.slice(i, i + size));
    i += size - overlap;
  }
  return chunks;
}
