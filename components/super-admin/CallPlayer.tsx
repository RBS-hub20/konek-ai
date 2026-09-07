'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { CallLog } from '@/lib/types2';

/* ═══════════════════════════════════════════════════════════════════
   One call, played back.

   Used by the activity log, the call feed and the dialer, so a recording
   behaves the same everywhere and there is one place to fix when it does
   not.

   The recording is asked for rather than assumed: the callback can be
   lost, and the route falls back to asking Twilio. So the player renders
   whenever the call reached Twilio at all, and says what happened if
   nothing comes back — a missing button gives the operator nothing to go
   on, while "Twilio has no recording for this one" does.
   ═══════════════════════════════════════════════════════════════════ */

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, s % 60)).padStart(2, '0')}`;

export function CallPlayer({ call, compact = false }: { call: CallLog; compact?: boolean }) {
  const [failed, setFailed] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  /* Nothing was ever dialled, so there is nothing to look for. */
  if (!call.twilio_sid && !call.recording_url) {
    return (
      <p className="text-[12px] leading-relaxed text-muted">
        This call never reached Twilio, so there is no recording.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {failed ? (
        <p className="text-[12px] leading-relaxed text-muted">{failed}</p>
      ) : (
        <>
          <audio
            controls
            preload="metadata"
            src={`/api/call/audio/${call.id}`}
            className="w-full"
            onLoadedMetadata={() => setLoading(false)}
            onCanPlay={() => setLoading(false)}
            onError={async () => {
              setLoading(false);
              /* Why it failed matters: "there is no recording" and "there is
                 one and it would not play" send you to different places. The
                 route says which in its body, and a 200 here means the file
                 arrived and the browser could not decode it. */
              try {
                const res = await fetch(`/api/call/audio/${call.id}`, { cache: 'no-store' });
                if (res.ok) {
                  setFailed('The recording downloaded but would not play. Twilio may still be writing it — try again in a moment.');
                  return;
                }
                const body = await res.json().catch(() => ({}));
                setFailed(
                  body.reason
                    ?? body.error
                    ?? 'No recording yet — Twilio adds it about thirty seconds after the call ends.'
                );
              } catch {
                setFailed('No recording yet — Twilio adds it about thirty seconds after the call ends.');
              }
            }}
          />
          {loading && (
            <p className="flex items-center gap-1.5 text-[11px] text-muted">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading the recording…
            </p>
          )}
        </>
      )}

      {!compact && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
          <span className="tabular-nums">{fmt(call.duration_seconds)} on the line</span>
          {call.status && <span>· {call.status}</span>}
          {call.language && <span>· {call.language}</span>}
        </div>
      )}
    </div>
  );
}

/** The words, under the audio. */
export function CallTranscript({ call }: { call: CallLog }) {
  if (!call.transcript) {
    return (
      <p className="text-[12px] text-muted">
        No transcript for this call.
        {call.duration_seconds > 0 && ' The bridge posts one when the conversation ends.'}
      </p>
    );
  }
  return (
    <p className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-brand border border-line bg-surface p-3.5 text-[12px] leading-relaxed text-ink">
      {call.transcript}
    </p>
  );
}
