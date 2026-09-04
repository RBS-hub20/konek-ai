import { addBrain } from '@/lib/server/repo';
import { addKnowledgeFile, getBusiness, removeKnowledgeFile } from '@/lib/server/tenant';
import { db, hasSupabase } from '@/lib/supabase';
import { hasOpenAI } from '@/lib/env';
import { fail, ok, describeError } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_BYTES = 20 * 1024 * 1024;
const BUCKET = 'knowledge';

/**
 * POST /api/business-brain/upload
 *
 *   multipart  → file        uploaded to Supabase Storage, recorded on the brain
 *   json       → { text }    pasted knowledge
 *   json       → { url }     website link (fetched and stripped to text)
 *
 * Text-bearing formats are also chunked into brain_chunks and embedded when
 * OPENAI_API_KEY is present, so the FAQ skill can answer from them.
 */
export async function POST(req: Request) {
  const contentType = req.headers.get('content-type') ?? '';

  try {
    const url = new URL(req.url);

    if (contentType.includes('application/json')) {
      const body = (await req.json()) as { businessId?: string; text?: string; url?: string };
      const business = await getBusiness(body.businessId);
      if (!business) return fail('No business found', 404);

      if (body.url) {
        const fetched = await fetchWebsiteText(body.url);
        if (!fetched.text) return fail('Could not read that URL', 422, fetched.error);
        const host = cleanHost(body.url);
        const res = await addBrain({ businessId: business.id, content: fetched.text, sourceType: 'website', sourceName: host });
        await addKnowledgeFile(business.id, { name: host, url: body.url, type: 'website', uploaded_at: new Date().toISOString() });
        return ok({ source: host, type: 'website', chunks: res.chunks, embedded: res.embedded, embeddings: embedNote() }, { status: 201 });
      }

      if (body.text?.trim()) {
        const res = await addBrain({ businessId: business.id, content: body.text, sourceType: 'manual', sourceName: 'manual note' });
        await addKnowledgeFile(business.id, { name: 'manual note', type: 'manual', uploaded_at: new Date().toISOString() });
        return ok({ source: 'manual note', type: 'manual', chunks: res.chunks, embedded: res.embedded, embeddings: embedNote() }, { status: 201 });
      }

      return fail('Provide text or url');
    }

    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      const business = await getBusiness((form.get('businessId') as string) || undefined);
      if (!business) return fail('No business found', 404);

      const file = form.get('file');
      if (!(file instanceof File)) return fail('file is required');
      if (file.size > MAX_BYTES) return fail('File is larger than 20MB', 413);

      const name = file.name || 'upload';
      const kind = extractionKind(name, file.type);

      /* Store the original in Supabase Storage so it can be re-read later. */
      let publicUrl: string | undefined;
      let storageWarning: string | undefined;
      if (hasSupabase) {
        const path = `${business.id}/${Date.now()}-${name.replace(/[^\w.\-]+/g, '_')}`;
        const bytes = new Uint8Array(await file.arrayBuffer());
        const { error } = await db().storage.from(BUCKET).upload(path, bytes, {
          contentType: file.type || 'application/octet-stream',
          upsert: true,
        });
        if (error) {
          storageWarning = `Storage upload failed: ${error.message}. Create a public bucket named "${BUCKET}" (supabase.sql does this).`;
        } else {
          publicUrl = db().storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
        }
      }

      let chunks = 0;
      let embedded = 0;
      let extracted = false;
      if (kind === 'text') {
        const text = await file.text();
        if (text.trim()) {
          const res = await addBrain({ businessId: business.id, content: text, sourceType: 'file', sourceName: name });
          chunks = res.chunks;
          embedded = res.embedded;
          extracted = true;
        }
      }

      await addKnowledgeFile(business.id, {
        name, url: publicUrl, size: file.size, type: kind,
        uploaded_at: new Date().toISOString(),
      });

      return ok(
        {
          source: name, type: kind, extracted, chunks, embedded, embeddings: embedNote(),
          url: publicUrl ?? null,
          ...(storageWarning ? { warning: storageWarning } : {}),
          ...(extracted ? {} : {
            warning: storageWarning ??
              `${kind.toUpperCase()} text extraction is not wired up — the file is stored and listed, but the agent cannot read its contents yet.`,
          }),
        },
        { status: 201 }
      );
    }

    void url;
    return fail('Send multipart/form-data or application/json', 415);
  } catch (err) {
    return fail('Upload failed', 500, describeError(err).detail);
  }
}

/** DELETE /api/business-brain/upload?businessId=&name= */
export async function DELETE(req: Request) {
  const p = new URL(req.url).searchParams;
  const name = p.get('name');
  if (!name) return fail('name is required');
  try {
    const business = await getBusiness(p.get('businessId'));
    if (!business) return fail('No business found', 404);
    const brain = await removeKnowledgeFile(business.id, name);
    return ok({ deleted: name, knowledge_files: brain.knowledge_files });
  } catch (err) {
    return fail('Could not remove file', 500, describeError(err).detail);
  }
}

const embedNote = () => (hasOpenAI ? 'openai' : 'disabled (no OPENAI_API_KEY)');

function extractionKind(name: string, mime: string): 'text' | 'pdf' | 'docx' | 'image' | 'binary' {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  if (['txt', 'md', 'csv', 'json', 'html', 'htm', 'tsv', 'yml', 'yaml'].includes(ext)) return 'text';
  if (mime.startsWith('text/') || mime === 'application/json') return 'text';
  if (ext === 'pdf' || mime === 'application/pdf') return 'pdf';
  if (['docx', 'doc'].includes(ext)) return 'docx';
  if (mime.startsWith('image/')) return 'image';
  return 'binary';
}

function cleanHost(u: string): string {
  try {
    return new URL(u.startsWith('http') ? u : `https://${u}`).host;
  } catch {
    return u;
  }
}

async function fetchWebsiteText(u: string): Promise<{ text: string; error?: string }> {
  try {
    const full = u.startsWith('http') ? u : `https://${u}`;
    const res = await fetch(full, {
      headers: { 'User-Agent': 'KONEK-AI/1.0 (+business-brain-importer)' },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return { text: '', error: `Site returned ${res.status}` };
    const html = await res.text();
    return {
      text: html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 40_000),
    };
  } catch (err) {
    return { text: '', error: describeError(err).detail };
  }
}
