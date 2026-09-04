'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Eye, Pause, Play, X } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Waveform } from '@/components/ui/Waveform';
import { Select } from '@/components/ui/Input';
import { useKonekStore } from '@/lib/store';
import { vibeToLabel, type CallLog } from '@/lib/types2';
import { cn } from '@/lib/utils';

const statusTone = (s: string) =>
  s === 'Hot Lead' ? 'accent'
  : s === 'Booked' ? 'success'
  : s === 'Failed' ? 'danger'
  : s === 'No Answer' ? 'default'
  : 'warning';

const STATUSES = ['All', 'Hot Lead', 'Booked', 'Completed', 'Follow-up', 'No Answer', 'Connected', 'Initiated', 'Failed'];

/** Splits a stored transcript back into speaker turns. */
function turns(text: string | null): { speaker: string; text: string }[] {
  if (!text?.trim()) return [];
  const parts = text.split(/(?=KONEK:|Customer:|Kai:)/g).map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 1) return [{ speaker: 'Transcript', text: text.trim() }];
  return parts.map((p) => ({
    speaker: /^(KONEK|Kai):/.test(p) ? 'KONEK' : 'Customer',
    text: p.replace(/^(KONEK:|Customer:|Kai:)\s*/, ''),
  }));
}

export function CallLogsTab() {
  const { calls, loadCalls } = useKonekStore();
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [open, setOpen] = useState<CallLog | null>(null);
  const [status, setStatus] = useState('All');
  const [vibe, setVibe] = useState('All');

  useEffect(() => { void loadCalls(); }, [loadCalls]);

  const vibes = useMemo(
    () => ['All', ...Array.from(new Set(calls.map((c) => c.vibe).filter(Boolean) as string[]))],
    [calls]
  );

  const rows = calls.filter(
    (c) => (status === 'All' || c.status === status) && (vibe === 'All' || c.vibe === vibe)
  );

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[22px] font-semibold tracking-tight text-ink">Call Logs</h1>
          <p className="mt-1.5 text-[13px] text-muted">Every call, what skills fired, and exactly what was said.</p>
        </div>
        <div className="flex gap-2">
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-40">
            {STATUSES.map((s) => <option key={s} value={s}>{s === 'All' ? 'All statuses' : s}</option>)}
          </Select>
          <Select value={vibe} onChange={(e) => setVibe(e.target.value)} className="w-44">
            {vibes.map((v) => <option key={v} value={v}>{v === 'All' ? 'All vibes' : vibeToLabel(v)}</option>)}
          </Select>
        </div>
      </div>

      <section className="overflow-hidden rounded-brand border border-line bg-paper">
        {rows.length === 0 ? (
          <p className="px-5 py-14 text-center text-[13px] text-muted">
            {calls.length === 0
              ? 'No calls recorded yet. Place one from Vibe Mode → Test call myself, or start a campaign.'
              : 'No calls match these filters.'}
          </p>
        ) : (
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
                {rows.map((c, i) => {
                  const playing = playingId === c.id;
                  return (
                    <tr key={c.id} className="border-b border-line last:border-0 hover:bg-surface">
                      <td className="px-5 py-4 text-[13px] font-medium text-ink">{c.customer_name || 'Unknown'}</td>
                      <td className="px-5 py-4 text-[12px] tabular-nums text-muted">{c.phone}</td>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap gap-1.5">
                          {c.skills_used.length ? c.skills_used.map((s) => <Badge key={s}>{s}</Badge>)
                            : <span className="text-[12px] text-muted">—</span>}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-[12px] text-muted">{c.vibe ? vibeToLabel(c.vibe) : '—'}</td>
                      <td className="px-5 py-4 text-[12px] tabular-nums text-ink">
                        {Math.floor(c.duration_seconds / 60)}:{String(c.duration_seconds % 60).padStart(2, '0')}
                      </td>
                      <td className="px-5 py-4"><Badge tone={statusTone(String(c.status))}>{c.status}</Badge></td>
                      <td className="w-[190px] px-5 py-4">
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            disabled={!c.recording_url}
                            title={c.recording_url ? 'Play recording' : 'No recording — needs Twilio call recording enabled'}
                            onClick={() => setPlayingId(playing ? null : c.id)}
                            className={cn(
                              'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors focus-ring',
                              playing ? 'border-ink bg-ink text-paper' : 'border-line text-ink hover:bg-surface',
                              !c.recording_url && 'opacity-40'
                            )}
                          >
                            {playing ? <Pause className="h-3 w-3" /> : <Play className="ml-0.5 h-3 w-3" />}
                          </button>
                          <Waveform bars={22} seed={(c.id.charCodeAt(0) * 7 + i * 13) % 200} playing={playing} height={20} className="flex-1" />
                        </div>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button
                          type="button" onClick={() => setOpen(c)} aria-label={`Transcript for ${c.customer_name ?? c.phone}`}
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
        )}
      </section>

      <AnimatePresence>
        {open && (
          <motion.div
            key="transcript-drawer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={() => setOpen(null)}
          >
            <motion.aside
              initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 40, opacity: 0 }}
              transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="flex h-full w-full max-w-md flex-col border-l border-line bg-paper"
            >
              <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
                <div>
                  <h3 className="font-display text-[15px] font-semibold text-ink">{open.customer_name || 'Unknown'}</h3>
                  <p className="mt-0.5 text-[12px] tabular-nums text-muted">
                    {open.phone} · {Math.floor(open.duration_seconds / 60)}:{String(open.duration_seconds % 60).padStart(2, '0')}
                    {open.vibe ? ` · ${vibeToLabel(open.vibe)}` : ''}
                  </p>
                </div>
                <button type="button" onClick={() => setOpen(null)} aria-label="Close transcript" className="rounded p-1 text-muted hover:text-ink focus-ring">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
                {turns(open.transcript).length === 0 ? (
                  <p className="text-[13px] leading-relaxed text-muted">
                    No transcript for this call. Transcripts arrive on the <code className="text-ink">/api/call/transcript</code> webhook
                    once Deepgram or Twilio transcription is configured.
                  </p>
                ) : (
                  turns(open.transcript).map((line, i) => (
                    <div key={i}>
                      <div className={cn('text-[11px] font-medium uppercase tracking-wide', line.speaker === 'KONEK' ? 'text-accent' : 'text-muted')}>
                        {line.speaker}
                      </div>
                      <p className="mt-1.5 text-[13px] leading-relaxed text-ink">{line.text}</p>
                    </div>
                  ))
                )}
              </div>

              <div className="border-t border-line px-6 py-4">
                <div className="flex flex-wrap gap-1.5">
                  {open.skills_used.map((s) => <Badge key={s} tone="accent">{s}</Badge>)}
                </div>
              </div>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
