import { previewSpeech } from '@/lib/voice/cartesiaPreview';
import { describeError, fail, readJson } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/outbound/preview-tts — { text, speed?, emotion?, country? }
 *
 * Returns MP3 so the browser can actually play it. The call path uses 8 kHz
 * mu-law because that is what a phone line carries; a browser needs neither
 * the format nor the bandwidth limit.
 */
export async function POST(req: Request) {
  const body = await readJson<{ text?: string; speed?: number; emotion?: string; country?: string }>(req);
  const text = body?.text?.trim();
  if (!text) return fail('text is required');
  if (text.length > 1200) return fail('That line is too long to preview. Keep it under 1200 characters.', 413);

  try {
    const result = await previewSpeech({
      text,
      country: body?.country,
      speed: body?.speed,
      emotion: body?.emotion,
    });

    return new Response(result.audio, {
      status: 200,
      headers: {
        'Content-Type': result.contentType,
        'Content-Length': String(result.audio.byteLength),
        'Cache-Control': 'no-store',
        /* Handy when a preview sounds wrong and you need to know which
           voice and model produced it. */
        'X-Konek-Voice': result.voiceId,
        'X-Konek-Model': result.model,
        'X-Konek-Language': result.language,
      },
    });
  } catch (err) {
    const detail = describeError(err).detail;
    return fail(
      /CARTESIA_API_KEY/.test(detail)
        ? 'Cartesia is not configured on this deployment'
        : 'Could not generate the preview',
      502,
      detail
    );
  }
}
