'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge, StatusDot } from '@/components/ui/Badge';
import { INTEGRATIONS } from '@/lib/mockData';

export function IntegrationsTab() {
  const [connected, setConnected] = useState<string[]>(
    INTEGRATIONS.filter((i) => i.connected).map((i) => i.name)
  );

  const toggle = (name: string) =>
    setConnected((c) => (c.includes(name) ? c.filter((x) => x !== name) : [...c, name]));

  return (
    <div className="space-y-7">
      <div>
        <h1 className="font-display text-[22px] font-semibold tracking-tight text-ink">Integrations</h1>
        <p className="mt-1.5 text-[13px] text-muted">Connect the tools your business already runs on.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {INTEGRATIONS.map((i) => {
          const on = connected.includes(i.name);
          return (
            <section key={i.name} className="flex flex-col rounded-brand border border-line bg-paper p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-[14px] font-semibold text-ink">{i.name}</h2>
                  <p className="mt-0.5 text-[11px] text-muted">{i.category}</p>
                </div>
                {on && (
                  <Badge tone="success">
                    <StatusDot tone="success" /> Connected
                  </Badge>
                )}
              </div>
              <p className="mt-4 flex-1 text-[12.5px] leading-relaxed text-muted">{i.detail}</p>
              <Button
                variant={on ? 'secondary' : 'primary'}
                size="sm"
                className="mt-5 w-full"
                onClick={() => toggle(i.name)}
              >
                {on ? 'Disconnect' : 'Connect'}
              </Button>
            </section>
          );
        })}
      </div>
    </div>
  );
}
