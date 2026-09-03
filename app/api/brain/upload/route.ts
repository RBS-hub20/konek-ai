import { addBrain } from '@/lib/server/repo';
import { DEMO_BUSINESS_ID } from '@/lib/server/seed';
import { hasOpenAI } from '@/lib/env';
import { fail, ok } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_BYTES = 20 * 1024 * 1024; // 20MB, matching the uploader's own limit

/**
 * POST /api/brain/upload
 *
 * Accepts either multipart/form-data — fields: file, businessId — or JSON:
 *   { businessId, text }            manual knowledge
 *   { businessId, url }             a website link
 *
 * Text is chunked, embedded when OPENAI_API_KEY is present, and written to
 * business_brain. Plain-text formats are extracted directly; binary formats
 * (PDF, DOCX) are recorded as a pending source — see the note below.
 */
export async function POST(req: Request) {
  const contentType = req.headers.get('content-type') ?? '';

  try {
    /* ── JSON: raw text or a website link ─────────────────────────── */
    if (contentType.includes('application/json')) {
      const body = (await req.json()) as { businessId?: string; text?: string; url?: string };
      const businessId = body.businessId ?? DEMO_BUSINESS_ID;

      if (body.url) {
        const fetched = await fetchWebsiteText(body.url);
        if (!fetched.text) return fail('Could not read that URL', 422, fetched.error);
        const res = await addBrain({
          businessId,
          content: fetched.text,
          sourceType: 'website',
          sourceName: cleanHost(body.url),
        });
        return ok({ source: cleanHost(body.url), type: 'website', ...summarise(res) }, { status: 201 });
      }

      if (body.text?.trim()) {
        const res = await addBrain({
          businessId,
          content: body.text,
          sourceType: 'manual',
          sourceName: 'manual note',
        });
        return ok({ source: 'manual note', type: 'manual', ...summarise(res) }, { status: 201 });
      }

      return fail('Provide text or url');
    }

    /* ── Multipart: an uploaded file ──────────────────────────────── */
    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      const businessId = (form.get('businessId') as string) || DEMO_BUSINESS_ID;
      const file = form.get('file');

      if (!(file instanceof File)) return fail('file is required');
      if (file.size > MAX_BYTES) return fail('File is larger than 20MB', 413);

      const name = file.name || 'upload';
      const kind = extractionKind(name, file.type);

      if (kind === 'text') {
        const text = await file.text();
        if (!text.trim()) return fail('That file is empty', 422);
        const res = await addBrain({ businessId, content: text, sourceType: 'file', sourceName: name });
        return ok({ source: name, type: 'file', extracted: true, ...summarise(res) }, { status: 201 });
      }

      /* Binary document. Recorded so it shows in the UI, but its contents are
         not parsed yet — wire a parser (pdf-parse / mammoth) here to extract. */
      const res = await addBrain({
        businessId,
        content: `[${name}] Uploaded ${kind.toUpperCase()} document, ${(file.size / 1024).toFixed(0)}KB. Text extraction for this format is not wired up yet, so its contents are not available to the agent.`,
        sourceType: kind,
        sourceName: name,
      });
      return ok(
        {
          source: name,
          type: kind,
          extracted: false,
          warning: `${kind.toUpperCase()} text extraction is not implemented — this source is stored but its contents are not searchable.`,
          ...summarise(res),
        },
        { status: 201 }
      );
    }

    return fail('Send multipart/form-data or application/json', 415);
  } catch (err) {
    return fail('Upload failed', 500, err instanceof Error ? err.message : String(err));
  }
}

function summarise(res: { chunks: number; embedded: number }) {
  return {
    chunks: res.chunks,
    embedded: res.embedded,
    embeddings: hasOpenAI ? 'openai' : 'disabled (no OPENAI_API_KEY)',
  };
}

function extractionKind(name: string, mime: string): 'text' | 'pdf' | 'docx' | 'binary' {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  if (['txt', 'md', 'csv', 'json', 'html', 'htm', 'tsv', 'yml', 'yaml'].includes(ext)) return 'text';
  if (mime.startsWith('text/') || mime === 'application/json') return 'text';
  if (ext === 'pdf' || mime === 'application/pdf') return 'pdf';
  if (ext === 'docx' || ext === 'doc') return 'docx';
  return 'binary';
}

function cleanHost(url: string): string {
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).host;
  } catch {
    return url;
  }
}

async function fetchWebsiteText(url: string): Promise<{ text: string; error?: string }> {
  try {
    const full = url.startsWith('http') ? url : `https://${url}`;
    const res = await fetch(full, {
      headers: { 'User-Agent': 'KONEK-AI/1.0 (+business-brain-importer)' },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return { text: '', error: `Site returned ${res.status}` };
    const html = await res.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return { text: text.slice(0, 40_000) };
  } catch (err) {
    return { text: '', error: err instanceof Error ? err.message : String(err) };
  }
}
