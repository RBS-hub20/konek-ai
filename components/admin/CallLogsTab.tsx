'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Eye, Pause, Play, X } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Waveform } from '@/components/ui/Waveform';
import { CALL_LOGS, VIBES, type CallLog, type Vibe } from '@/lib/mockData';
import { api, tryApi } from '@/lib/apiClient';
import type { CallRow } from '@/lib/types';
import { useKonekStore } from '@/lib/store';
import { cn } from '@/lib/utils';

function statusTone(s: CallLog['status']) {
  return s === 'Hot Lead' ? 'accent' : s === 'Booked' ? 'success' : s === 'No Answer' ? 'default' : 'warning';
}

/* Maps a stored call row onto the shape the table renders. */
function toCallLog(r: CallRow, i: number): CallLog {
  const mins = Math.floor((r.duration ?? 0) / 60);
  const secs = (r.duration ?? 0) % 60;
  const status: CallLog['status'] =
    r.status === 'hot_lead' ? 'Hot Lead'
    : r.status === 'booked' ? 'Booked'
    : r.status === 'no_answer' ? 'No Answer'
    : r.status === 'completed' ? 'Completed'
    : 'Follow-up';

  return {
    id: r.id,
    customer: r.customer_name || 'Unknown caller',
    phone: r.customer_phone || '—',
    skills: (r.skills_used ?? []).map(titleCase),
    vibe: (VIBES.includes(r.vibe as Vibe) ? (r.vibe as Vibe) : 'PRO CLOSER'),
    duration: `${mins}:${String(secs).padStart(2, '0')}`,
    status,
    seed: (r.id.charCodeAt(0) * 7 + i * 13) % 200,
    transcript: parseTranscript(r.transcript),
  };
}

const titleCase = (s: string) =>
  `${s.charAt(0).toUpperCase()}${s.slice(1)} Skill`;

/* Transcripts arrive as one string; split it back into speaker turns when
   it uses the "KONEK:" / "Customer:" convention. */
function parseTranscript(text: string | null): CallLog['transcript'] {
  if (!text?.trim()) return [{ speaker: 'KONEK', text: 'No transcript recorded for this call yet.' }];
  const parts = text.split(/(?=KONEK:|Customer:)/g).map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 1) return [{ speaker: 'KONEK', text: text.trim() }];
  return parts.map((p) => {
    const isKonek = p.startsWith('KONEK:');
    return {
      speaker: (isKonek ? 'KONEK' : 'Customer') as 'KONEK' | 'Customer',
      text: p.replace(/^(KONEK:|Customer:)\s*/, ''),
    };
  });
}

export function CallLogsTab() {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<CallLog | null>(null);
  const businessId = useKonekStore((s) => s.businessId);

  /* Live rows from /api/call. The sample log stays as the fallback so the
     table is never empty on a fresh install. */
  const [rows, setRows] = useState<CallLog[]>(CALL_LOGS);
  const [source, setSource] = useState<'live' | 'sample'>('sample');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await tryApi(() => api.calls(businessId ?? undefined));
      if (cancelled || !res) return;
      if (res.calls.length) {
        setRows(res.calls.map(toCallLog));
        setSource('live');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [businessId]);

  return (
    <div className="space-y-7">
      <div>
        <h1 className="font-display text-[22px] font-semibold tracking-tight text-ink">Call Logs</h1>
        <p className="mt-1.5 text-[13px] text-muted">
          Every call, what skills fired, and exactly what was said.
          {source === 'sample' && ' Showing sample data — place a call to populate this table.'}
        </p>
      </div>

      <section className="overflow-hidden rounded-brand border border-line bg-paper">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left">
            <thead>
              <tr className="border-b border-line text-[11px] uppercase tracking-wide text-muted">
                <th className="px-5 py-3 font-medium">Customer</th>
                <th className="px-5 py-3 font-medium">Phone</th>
                <th className="px-5 py-3 font-medium">Skills Used</th>
                <th className="px-5 py-3 font-medium">Vibe</th>
                <th className="px-5 py-3 font-medium">Duration</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Recording</th>
                <th className="px-5 py-3 text-right font-medium">Transcript</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const playing = playingId === c.id;
                return (
                  <tr key={c.id} className="border-b border-line last:border-0 hover:bg-surface">
                    <td className="px-5 py-4 text-[13px] font-medium text-ink">{c.customer}</td>
                    <td className="px-5 py-4 text-[12px] tabular-nums text-muted">{c.phone}</td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-1.5">
                        {c.skills.map((s) => (
                          <Badge key={s}>{s}</Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-[12px] text-muted">{c.vibe}</td>
                    <td className="px-5 py-4 text-[12px] tabular-nums text-ink">{c.duration}</td>
                    <td className="px-5 py-4">
                      <Badge tone={statusTone(c.status)}>{c.status}</Badge>
                    </td>
                    <td className="w-[190px] px-5 py-4">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setPlayingId(playing ? null : c.id)}
                          aria-label={playing ? `Pause ${c.customer}` : `Play ${c.customer}`}
                          className={cn(
                            'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors focus-ring',
                            playing ? 'border-ink bg-ink text-paper' : 'border-line text-ink hover:bg-surface'
                          )}
                        >
                          {playing ? <Pause className="h-3 w-3" /> : <Play className="ml-0.5 h-3 w-3" />}
                        </button>
                        <Waveform bars={22} seed={c.seed} playing={playing} height={20} className="flex-1" />
                      </div>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => setTranscript(c)}
                        aria-label={`Transcript for ${c.customer}`}
                        className="rounded p-1.5 text-muted transition-colors hover:text-ink focus-ring"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Transcript drawer */}
      <AnimatePresence>
        {transcript && (
          <motion.div
            key="transcript-drawer"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex justify-end bg-black/40"
            onClick={() => setTranscript(null)}
          >
            <motion.aside
              initial={{ x: 40, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 40, opacity: 0 }}
              transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="flex h-full w-full max-w-md flex-col border-l border-line bg-paper"
            >
              <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
                <div>
                  <h3 className="font-display text-[15px] font-semibold text-ink">{transcript.customer}</h3>
                  <p className="mt-0.5 text-[12px] tabular-nums text-muted">
                    {transcript.phone} · {transcript.duration} · {transcript.vibe}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setTranscript(null)}
                  aria-label="Close transcript"
                  className="rounded p-1 text-muted transition-colors hover:text-ink focus-ring"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
                {transcript.transcript.map((line, i) => (
                  <div key={i}>
                    <div
                      className={cn(
                        'text-[11px] font-medium uppercase tracking-wide',
                        line.speaker === 'KONEK' ? 'text-accent' : 'text-muted'
                      )}
                    >
                      {line.speaker}
                    </div>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-ink">{line.text}</p>
                  </div>
                ))}
              </div>

              <div className="border-t border-line px-6 py-4">
                <div className="flex flex-wrap gap-1.5">
                  {transcript.skills.map((s) => (
                    <Badge key={s} tone="accent">
                      {s}
                    </Badge>
                  ))}
                </div>
              </div>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
