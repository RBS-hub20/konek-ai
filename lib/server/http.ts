import { NextResponse } from 'next/server';

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function fail(message: string, status = 400, detail?: string) {
  return NextResponse.json({ error: message, ...(detail ? { detail } : {}) }, { status });
}

/**
 * Supabase rejects with a plain object ({ message, details, hint, code }), not
 * an Error, so String(err) yields "[object Object]" and hides the real cause.
 * Pull the useful fields out instead.
 */
export function describeError(err: unknown): { detail: string; code?: string; hint?: string } {
  if (err instanceof Error) return { detail: err.message };
  if (err && typeof err === 'object') {
    const e = err as { message?: string; details?: string; hint?: string; code?: string };
    const detail = [e.message, e.details].filter(Boolean).join(' — ');
    if (detail) return { detail, ...(e.code ? { code: e.code } : {}), ...(e.hint ? { hint: e.hint } : {}) };
    try {
      return { detail: JSON.stringify(err) };
    } catch {
      return { detail: 'Unknown error' };
    }
  }
  return { detail: String(err) };
}

/** Wraps a handler so an unexpected throw becomes a readable 500. */
export async function handle<T>(fn: () => Promise<T>) {
  try {
    return ok(await fn());
  } catch (err) {
    const { detail, code, hint } = describeError(err);
    /* Surfaced in Vercel logs as well as the response. */
    console.error('[KONEK AI] request failed:', detail, code ?? '', hint ?? '');
    return NextResponse.json(
      { error: 'Request failed', detail, ...(code ? { code } : {}), ...(hint ? { hint } : {}) },
      { status: 500 }
    );
  }
}

export async function readJson<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}
