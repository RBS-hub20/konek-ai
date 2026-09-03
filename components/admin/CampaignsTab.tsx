'use client';

import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Progress } from '@/components/ui/Progress';
import { CAMPAIGNS } from '@/lib/mockData';

export function CampaignsTab() {
  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[22px] font-semibold tracking-tight text-ink">Campaigns</h1>
          <p className="mt-1.5 text-[13px] text-muted">Batches of calls KONEK runs for you, start to finish.</p>
        </div>
        <Button size="sm" className="gap-1.5">
          <Plus className="h-3.5 w-3.5" /> New Campaign
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {CAMPAIGNS.map((c) => (
          <section key={c.name} className="rounded-brand border border-line bg-paper p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-[15px] font-semibold text-ink">{c.name}</h2>
                <p className="mt-1 text-[12px] text-muted">{c.vibe}</p>
              </div>
              <Badge tone={c.status === 'Running' ? 'accent' : c.status === 'Completed' ? 'success' : 'default'}>
                {c.status}
              </Badge>
            </div>

            <div className="mt-6 grid grid-cols-3 gap-4 text-[13px]">
              <div>
                <div className="text-[11px] text-muted">Audience</div>
                <div className="mt-1 font-display text-[18px] font-semibold tabular-nums text-ink">{c.audience}</div>
              </div>
              <div>
                <div className="text-[11px] text-muted">Called</div>
                <div className="mt-1 font-display text-[18px] font-semibold tabular-nums text-ink">{c.done}</div>
              </div>
              <div>
                <div className="text-[11px] text-muted">Hot leads</div>
                <div className="mt-1 font-display text-[18px] font-semibold tabular-nums text-accent">{c.hot}</div>
              </div>
            </div>

            <Progress value={c.done} max={c.audience} tone="auto" className="mt-6" />
          </section>
        ))}
      </div>
    </div>
  );
}
