'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Progress } from '@/components/ui/Progress';
import { api } from '@/lib/apiClient';
import { needsUnlock, useKonekStore } from '@/lib/store';
import { vibeToLabel } from '@/lib/types2';
import { NewCampaignDialog } from './NewCampaignDialog';
import { UnlockDialog } from './UnlockDialog';

export function CampaignsTab() {
  const { campaigns, loadCampaigns, loadOverview, loadCalls, businessId } = useKonekStore();
  const [open, setOpen] = useState(false);
  const [showUnlock, setShowUnlock] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingStart, setPendingStart] = useState<string | null>(null);

  useEffect(() => { void loadCampaigns(); }, [loadCampaigns]);

  const start = async (id: string) => {
    setRunning(id);
    setNotice(null);
    try {
      const res = await api.startCampaign(id, businessId ?? undefined);
      setNotice(
        res.started === 0 && res.failed === 0
          ? 'Nothing to dial — every contact has been called.'
          : `Dialled ${res.started}${res.failed ? `, ${res.failed} failed` : ''}. ${res.remaining} left.${res.note ? ` ${res.note}` : ''}`
      );
      await Promise.all([loadCampaigns(), loadOverview(), loadCalls()]);
    } catch (err) {
      if (needsUnlock(err)) {
        setPendingStart(id);
        setShowUnlock(true);
      } else {
        setNotice(err instanceof Error ? err.message : 'Could not start the campaign');
      }
    } finally {
      setRunning(null);
    }
  };

  const remove = async (id: string) => {
    await api.deleteCampaign(id);
    await loadCampaigns();
  };

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[22px] font-semibold tracking-tight text-ink">Campaigns</h1>
          <p className="mt-1.5 text-[13px] text-muted">Batches of calls KONEK runs for you, start to finish.</p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> New Campaign
        </Button>
      </div>

      {notice && (
        <div className="rounded-brand border border-line bg-surface p-4 text-[13px] text-muted">{notice}</div>
      )}

      {campaigns.length === 0 ? (
        <div className="rounded-brand border border-dashed border-line p-12 text-center">
          <p className="text-[13px] text-muted">No campaigns yet.</p>
          <Button size="sm" className="mt-4 gap-1.5" onClick={() => setOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Create your first campaign
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {campaigns.map((c) => (
            <section key={c.id} className="rounded-brand border border-line bg-paper p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="truncate font-display text-[15px] font-semibold text-ink">{c.name}</h2>
                  <p className="mt-1 text-[12px] text-muted">{vibeToLabel(c.vibe)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone={c.status === 'Running' ? 'accent' : c.status === 'Completed' ? 'success' : 'default'}>
                    {c.status}
                  </Badge>
                  <button
                    type="button" aria-label={`Delete ${c.name}`} onClick={() => void remove(c.id)}
                    className="rounded p-1.5 text-muted transition-colors hover:text-red-500 focus-ring"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-3 gap-4 text-[13px]">
                <div>
                  <div className="text-[11px] text-muted">Audience</div>
                  <div className="mt-1 font-display text-[18px] font-semibold tabular-nums text-ink">{c.audience_count}</div>
                </div>
                <div>
                  <div className="text-[11px] text-muted">Called</div>
                  <div className="mt-1 font-display text-[18px] font-semibold tabular-nums text-ink">{c.called_count}</div>
                </div>
                <div>
                  <div className="text-[11px] text-muted">Hot leads</div>
                  <div className="mt-1 font-display text-[18px] font-semibold tabular-nums text-accent">{c.hot_leads}</div>
                </div>
              </div>

              <Progress value={c.called_count} max={Math.max(c.audience_count, 1)} tone="auto" className="mt-6" />

              {c.skills.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {c.skills.map((s) => <Badge key={s}>{s}</Badge>)}
                </div>
              )}

              <div className="mt-5 flex gap-2 border-t border-line pt-4">
                <Button
                  size="sm"
                  onClick={() => void start(c.id)}
                  disabled={running === c.id || c.audience_count === 0 || c.called_count >= c.audience_count}
                >
                  {running === c.id
                    ? 'Calling…'
                    : c.called_count >= c.audience_count && c.audience_count > 0
                      ? 'All called'
                      : 'Start Calling'}
                </Button>
                {c.audience_count === 0 && <span className="self-center text-[11px] text-muted">Add contacts first</span>}
              </div>
            </section>
          ))}
        </div>
      )}

      <NewCampaignDialog open={open} onClose={() => setOpen(false)} onCreated={() => void loadCampaigns()} />
      <UnlockDialog
        open={showUnlock}
        onClose={() => setShowUnlock(false)}
        onUnlocked={() => { if (pendingStart) void start(pendingStart); setPendingStart(null); }}
      />
    </div>
  );
}
