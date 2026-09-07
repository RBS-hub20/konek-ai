'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { CallPlayer, CallTranscript } from '@/components/super-admin/CallPlayer';
import { api } from '@/lib/apiClient';
import type { CallLog } from '@/lib/types2';

/**
 * The last call to a lead, played in the call list.
 *
 * Fetched on open rather than with the list: most rows are never expanded,
 * and joining every lead to its call would make the table slower for
 * everyone to help the one row somebody clicked.
 */
export function LeadRecording({ leadId, label }: { leadId: string; label: string }) {
  const [call, setCall] = useState<CallLog | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await api.leadCall(leadId);
        if (!alive) return;
        setCall(res.call);
        setReason(res.reason ?? null);
      } catch (err) {
        if (alive) setReason(err instanceof Error ? err.message : 'Could not load that call.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [leadId]);

  if (loading) {
    return (
      <p className="flex items-center gap-1.5 text-[12px] text-muted">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Finding the last call to {label}…
      </p>
    );
  }
  if (!call) return <p className="text-[12px] leading-relaxed text-muted">{reason ?? 'No call to play.'}</p>;

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div>
        <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted">
          Last call to {label}
        </div>
        <CallPlayer call={call} />
      </div>
      <div>
        <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted">Transcript</div>
        <CallTranscript call={call} />
      </div>
    </div>
  );
}
