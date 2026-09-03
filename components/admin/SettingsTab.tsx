'use client';

import { Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Progress } from '@/components/ui/Progress';
import { Field, Input } from '@/components/ui/Input';
import { Switch } from '@/components/ui/Switch';
import { useKonekStore } from '@/lib/store';
import { PRICING } from '@/lib/mockData';

export function SettingsTab() {
  const { twilioNumber, setTwilioNumber, whatsapp, setWhatsapp } = useKonekStore();
  const pro = PRICING.find((p) => p.name === 'Pro')!;

  return (
    <div className="space-y-7">
      <div>
        <h1 className="font-display text-[22px] font-semibold tracking-tight text-ink">Settings</h1>
        <p className="mt-1.5 text-[13px] text-muted">Your number, channels and billing.</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Phone number */}
        <section className="rounded-brand border border-line bg-paper p-6">
          <h2 className="font-display text-[14px] font-semibold text-ink">Twilio Number</h2>
          <p className="mt-1 text-[12px] text-muted">The number your customers see when KONEK calls.</p>
          <div className="mt-6 space-y-5">
            <Field label="Outbound number" hint="Verified and active on Twilio.">
              <Input value={twilioNumber} onChange={(e) => setTwilioNumber(e.target.value)} />
            </Field>
            <div className="flex items-center gap-2 text-[12px] text-muted">
              <Check className="h-3.5 w-3.5 text-emerald-500" />
              Caller ID verified · PH region
            </div>
            <Button variant="secondary" size="sm">Buy another number</Button>
          </div>
        </section>

        {/* Channels */}
        <section className="rounded-brand border border-line bg-paper p-6">
          <h2 className="font-display text-[14px] font-semibold text-ink">Channels</h2>
          <p className="mt-1 text-[12px] text-muted">How KONEK follows up after the call.</p>
          <div className="mt-6 space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[13px] font-medium text-ink">WhatsApp follow-up</div>
                <p className="mt-1 text-[12px] leading-relaxed text-muted">
                  Send the confirmation, payment link or review link on WhatsApp after every call.
                </p>
              </div>
              <Switch checked={whatsapp} onCheckedChange={setWhatsapp} label="WhatsApp follow-up" />
            </div>
            <div className="flex items-start justify-between gap-4 border-t border-line pt-5">
              <div>
                <div className="text-[13px] font-medium text-ink">SMS fallback</div>
                <p className="mt-1 text-[12px] leading-relaxed text-muted">
                  Used automatically when WhatsApp is not available on the number.
                </p>
              </div>
              <Badge tone="success">Always on</Badge>
            </div>
          </div>
        </section>

        {/* Billing */}
        <section className="rounded-brand border border-line bg-paper p-6 lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="font-display text-[14px] font-semibold text-ink">Billing</h2>
              <p className="mt-1 text-[12px] text-muted">Current plan and usage this cycle.</p>
            </div>
            <Badge tone="solid">{pro.name} · {pro.price}{pro.period}</Badge>
          </div>

          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <div>
              <div className="mb-2 flex items-baseline justify-between text-[12px]">
                <span className="text-muted">Calls used</span>
                <span className="tabular-nums text-ink">1,840 / 2,000</span>
              </div>
              <Progress value={1840} max={2000} tone="auto" />
              <p className="mt-3 text-[12px] text-muted">Resets on the 1st. Overage is $0.09 per call.</p>
            </div>
            <div className="space-y-3 text-[13px]">
              <div className="flex items-center justify-between">
                <span className="text-muted">Next invoice</span>
                <span className="tabular-nums text-ink">$149.00</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">Payment method</span>
                <span className="text-ink">Visa •••• 4242</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">Billing email</span>
                <span className="text-ink">bianca@novaaesthetics.ph</span>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-2 border-t border-line pt-5">
            <Button size="sm">Upgrade plan</Button>
            <Button size="sm" variant="secondary">Manage payment</Button>
            <Button size="sm" variant="ghost">Download invoices</Button>
          </div>
        </section>
      </div>
    </div>
  );
}
