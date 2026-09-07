'use client';

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Loader2, PhoneCall, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Field, Input, Textarea } from '@/components/ui/Input';
import { api } from '@/lib/apiClient';
import { LEAD_DISPOSITIONS, type Lead, type LeadDisposition } from '@/lib/types2';
import { cn } from '@/lib/utils';

/* ═══════════════════════════════════════════════════════════════════
   One call, start to finish.

   Dial → watch it ring → hear it back → say what came of it. The last
   step is the one that matters: a dialer that does not capture the
   outcome is just a phone.
   ═══════════════════════════════════════════════════════════════════ */

interface CallState {
  status: string;
  label: string;
  rang: boolean;
  finished: boolean;
  failed: boolean;
  ready: boolean;
  durationSeconds: number;
  recordingUrl: string | null;
  hasRecording: boolean;
  transcript: string | null;
  failureReason?: string;
}

interface Dialled {
  callId: string | null;
  callToken: string | null;
  to: string;
  language: string;
  script: { id: string; name: string; speed: number | null } | null;
  callerWarning?: string;
  opener?: string;
}

export function PowerDialer({
  lead, scriptId, onClose, onSaved,
}: {
  lead: Lead;
  /** The script chosen in Script Studio; null lets the server pick. */
  scriptId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [dialled, setDialled] = useState<Dialled | null>(null);
  const [call, setCall] = useState<CallState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialling, setDialling] = useState(true);

  const [status, setStatus] = useState<LeadDisposition | null>(null);
  const [notes, setNotes] = useState(lead.notes ?? '');
  const [followUp, setFollowUp] = useState('');
  const [saving, setSaving] = useState(false);

  /* Dial once, on open. */
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await api.callLead(lead.id, scriptId);
        if (!alive) return;
        setDialled(res as unknown as Dialled);
      } catch (err) {
        if (!alive) return;
        setError(err instanceof Error ? err.message : 'The call could not be placed.');
      } finally {
        if (alive) setDialling(false);
      }
    })();
    return () => { alive = false; };
  }, [lead.id, scriptId]);

  const callId = dialled?.callId ?? null;
  const token = dialled?.callToken ?? null;

  const poll = useCallback(async () => {
    if (!callId) return true;
    try {
      const q = token ? `?t=${encodeURIComponent(token)}` : '';
      const res = await fetch(`/api/try-free-call/${callId}${q}`, { cache: 'no-store' });
      if (!res.ok) return false;
      const body = (await res.json()) as CallState;
      setCall(body);
      return body.failed || body.ready;
    } catch {
      return false;
    }
  }, [callId, token]);

  /* Keeps going past the end of the call — the recording and transcript
     land afterwards. */
  useEffect(() => {
    if (!callId) return;
    let alive = true;
    void poll();
    const t = setInterval(async () => {
      if (!alive) return;
      if (await poll()) clearInterval(t);
    }, 4000);
    const stop = setTimeout(() => clearInterval(t), 300_000);
    return () => { alive = false; clearInterval(t); clearTimeout(stop); };
  }, [callId, poll]);

  const save = async () => {
    if (!status) return;
    setSaving(true);
    try {
      await api.updateLead(lead.id, {
        status,
        notes: notes.trim() || null,
        next_follow_up_at: status === 'Callback' && followUp ? new Date(followUp).toISOString() : null,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the outcome.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        key="dialer"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.16 }}
        className="fixed inset-0 z-[60] flex items-end justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:items-center"
        onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          role="dialog" aria-modal="true" aria-label={`Calling ${lead.company ?? lead.phone}`}
          initial={{ opacity: 0, y: 20, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="my-auto w-full max-w-[560px] overflow-hidden rounded-brand border border-line bg-paper shadow-2xl"
        >
          {/* Who, and with what */}
          <div className="flex items-start justify-between gap-4 border-b border-line p-6">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <PhoneCall className={cn('h-4 w-4', call?.rang ? 'text-accent' : 'text-muted')} />
                <h2 className="truncate font-display text-[17px] font-semibold text-ink">
                  {lead.company ?? 'Lead'}
                </h2>
              </div>
              <p className="mt-1 font-mono text-[12px] text-muted">{dialled?.to ?? lead.phone}</p>
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                {dialled?.script && <Badge tone="accent">{dialled.script.name}</Badge>}
                {dialled?.script?.speed && <Badge>speed {dialled.script.speed}</Badge>}
                {dialled?.language && <Badge>{dialled.language}</Badge>}
                {lead.country && <Badge>{lead.country}</Badge>}
              </div>
            </div>
            <button
              type="button" onClick={onClose} aria-label="Close"
              className="-mr-1 -mt-1 rounded p-1.5 text-muted transition-colors hover:text-ink focus-ring"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="p-6">
            {error && (
              <div className="mb-5 flex items-start gap-2.5 rounded-brand border border-red-500/40 bg-surface p-3.5">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
                <p className="text-[12px] leading-relaxed text-ink">{error}</p>
              </div>
            )}

            {dialled?.callerWarning && (
              <div className="mb-5 flex items-start gap-2.5 rounded-brand border border-amber-500/40 bg-surface p-3.5">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                <p className="text-[12px] leading-relaxed text-muted">{dialled.callerWarning}</p>
              </div>
            )}

            {/* Live state */}
            <div className="flex items-center gap-3 rounded-brand border border-line bg-surface px-4 py-3.5">
              {!call?.finished && !call?.failed && !error && (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted" />
              )}
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium text-ink">
                  {dialling ? 'Placing the call…' : call?.label ?? 'Connecting…'}
                </div>
                <div className="text-[12px] text-muted">
                  {call?.failureReason
                    ? call.failureReason
                    : call?.durationSeconds
                      ? `${call.durationSeconds}s on the line`
                      : 'Duration lands when the call ends'}
                </div>
              </div>
            </div>

            {dialled?.opener && !call?.rang && (
              <p className="mt-4 text-[12px] leading-relaxed text-muted">
                Opening line: <span className="text-ink">“{dialled.opener}”</span>
              </p>
            )}

            {/* Hear it back */}
            {call?.recordingUrl && (
              <div className="mt-5">
                <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted">
                  How Cindy sounded
                </div>
                <audio controls preload="metadata" src={call.recordingUrl} className="w-full" />
              </div>
            )}

            {call?.transcript && (
              <div className="mt-5">
                <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted">Transcript</div>
                <p className="max-h-44 overflow-y-auto whitespace-pre-wrap rounded-brand border border-line bg-surface p-3.5 text-[12px] leading-relaxed text-ink">
                  {call.transcript}
                </p>
              </div>
            )}

            {/* What came of it */}
            <div className="mt-6 border-t border-line pt-5">
              <div className="text-[13px] font-medium text-ink">How did it go?</div>
              <p className="mt-0.5 text-[12px] text-muted">
                Saved against the lead. Hot leads are what the Overview counts.
              </p>

              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {LEAD_DISPOSITIONS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setStatus(d)}
                    className={cn(
                      'rounded-brand border px-3 py-2.5 text-[12px] font-medium transition-colors focus-ring',
                      status === d
                        ? d === 'Hot' ? 'border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                          : d === 'Not interested' ? 'border-ink bg-surface text-muted'
                          : 'border-accent bg-accent/10 text-accent'
                        : 'border-line text-muted hover:bg-surface hover:text-ink'
                    )}
                  >
                    {d === 'Hot' ? '🔥 Hot' : d}
                  </button>
                ))}
              </div>

              {status === 'Callback' && (
                <div className="mt-4">
                  <Field label="Call them back on">
                    <Input type="datetime-local" value={followUp} onChange={(e) => setFollowUp(e.target.value)} />
                  </Field>
                </div>
              )}

              <div className="mt-4">
                <Field label="Notes">
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Owner asked for a callback after lunch. Two branches, misses calls at rush hour."
                    className="min-h-[80px]"
                  />
                </Field>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-line bg-surface px-6 py-4">
            <button type="button" onClick={onClose} className="text-[12px] text-muted hover:text-ink focus-ring">
              Close without saving
            </button>
            <Button disabled={!status || saving} onClick={() => void save()}>
              {saving ? 'Saving…' : 'Save outcome'}
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
