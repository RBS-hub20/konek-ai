import { streamCallRecording } from '@/lib/server/callAudio';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/call/audio/:id — the recording of any call, playable.
 *
 * The console's own name for it. /api/try-free-call/:id/audio is the same
 * implementation under the name the trial funnel gave it first, which reads
 * oddly on a sales call.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  return streamCallRecording(req, params.id?.trim());
}
