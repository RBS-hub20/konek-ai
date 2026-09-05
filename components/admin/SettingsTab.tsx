'use client';

import { useEffect, useState } from 'react';
import { Check, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Progress } from '@/components/ui/Progress';
import { Field, Input } from '@/components/ui/Input';
import { Switch } from '@/components/ui/Switch';
import { useKonekStore } from '@/lib/store';
import { api, tryApi } from '@/lib/apiClient';

export function SettingsTab() {
  const { business, setBusinessField } = useKonekStore();

  const [number, setNumber] = useState('');
  const [handoff, setHandoff] = useState('');
  const [savingHandoff, setSavingHandoff] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Verified against the real Twilio account, not just the string format. */
  const [verify, setVerify] = useState<{ checking: boolean; verified: boolean | null; reason?: string }>({
    checking: false, verified: null,
  });

  useEffect(() => {
    if (business) {
      setNumber(business.outbound_number ?? '');
      setHandoff(business.handoff_number ?? '');
    }
  }, [business]);

  const saveHandoff = async () => {
    setSavingHandoff(true);
    try {
      await setBusinessField({ handoff_number: handoff.trim() || null });
    } finally {
      setSavingHandoff(false);
    }
  };

  useEffect(() => {
    const n = business?.outbound_number;
    if (!n) {
      setVerify({ checking: false, verified: null });
      return;
    }
    let cancelled = false;
    setVerify({ checking: true, verified: null });
    (async () => {
      const res = await tryApi(() => api.twilioNumbers(n));
      if (cancelled) return;
      if (!res?.live) {
        setVerify({ checking: false, verified: null, reason: 'Twilio is not configured on this server.' });
      } else {
        setVerify({ checking: false, verified: res.verify?.verified ?? false, reason: res.verify?.reason });
      }
    })();
    return () => { cancelled = true; };
  }, [business?.outbound_number]);

  const saveNumber = async () => {
    setSaving(true); setError(null); setSaved(false);
    try {
      await setBusinessField({ outbound_number: number.trim() || null });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const setChannel = (key: 'whatsapp_followup' | 'sms_fallback', value: boolean) => {
    void setBusinessField({ settings: { ...(business?.settings ?? {}), [key]: value } });
  };

  const used = business?.calls_used ?? 0;
  const limit = business?.calls_limit ?? 1;
  const planPrice = business?.plan === 'pro' ? '$149' : business?.plan === 'enterprise' ? 'Custom' : '$49';

  return (
    <div className="space-y-7">
      <div>
        <h1 className="font-display text-[22px] font-semibold tracking-tight text-ink">Settings</h1>
        <p className="mt-1.5 text-[13px] text-muted">Your number, channels and billing.</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Outbound number */}
        <section className="rounded-brand border border-line bg-paper p-6">
          <h2 className="font-display text-[14px] font-semibold text-ink">Twilio Number</h2>
          <p className="mt-1 text-[12px] text-muted">The number your customers see when KONEK calls.</p>
          <div className="mt-6 space-y-5">
            <Field label="Outbound number" hint="Saved to this business and used for every call it places.">
              <Input
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveNumber()}
                placeholder="+12232263852"
              />
            </Field>

            <div className="flex items-center gap-2 text-[12px]">
              {verify.checking ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin text-muted" /><span className="text-muted">Checking Twilio…</span></>
              ) : verify.verified === true ? (
                <><Check className="h-3.5 w-3.5 text-emerald-500" /><span className="text-muted">Verified and active on Twilio</span></>
              ) : verify.verified === false ? (
                <><AlertCircle className="h-3.5 w-3.5 text-amber-500" /><span className="text-muted">{verify.reason ?? 'Not found on the Twilio account'}</span></>
              ) : (
                <span className="text-muted">{verify.reason ?? 'Add a number to verify it.'}</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button size="sm" onClick={saveNumber} disabled={saving || number === (business?.outbound_number ?? '')}>
                {saving ? 'Saving…' : saved ? 'Saved' : 'Save number'}
              </Button>
              {error && <span className="text-[12px] text-red-500">{error}</span>}
            </div>
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
              <Switch
                checked={Boolean(business?.settings?.whatsapp_followup)}
                onCheckedChange={(v) => setChannel('whatsapp_followup', v)}
                label="WhatsApp follow-up"
              />
            </div>
            <div className="flex items-start justify-between gap-4 border-t border-line pt-5">
              <div>
                <div className="text-[13px] font-medium text-ink">SMS fallback</div>
                <p className="mt-1 text-[12px] leading-relaxed text-muted">
                  Used automatically when WhatsApp is not available on the number.
                </p>
              </div>
              <Switch
                checked={Boolean(business?.settings?.sms_fallback)}
                onCheckedChange={(v) => setChannel('sms_fallback', v)}
                label="SMS fallback"
              />
            </div>
          </div>
        </section>

        {/* Human handoff */}
        <section className="rounded-brand border border-line bg-paper p-6">
          <h2 className="font-display text-[14px] font-semibold text-ink">Human handoff</h2>
          <p className="mt-1 text-[12px] text-muted">
            When a caller asks for a person, KONEK transfers them instead of arguing.
          </p>
          <div className="mt-6 space-y-5">
            <Field
              label="Transfer calls to"
              hint="Your mobile, or the front desk. Leave empty to keep every call with KONEK."
            >
              <Input
                value={handoff}
                onChange={(e) => setHandoff(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveHandoff()}
                placeholder="+639214878257"
                inputMode="tel"
              />
            </Field>

            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[13px] font-medium text-ink">Allow handoff</div>
                <p className="mt-1 text-[12px] leading-relaxed text-muted">
                  Triggers on “can I speak to a person”, “is this a robot”, “makausap ang tao” and the
                  equivalents in Arabic and Hindi.
                </p>
              </div>
              <Switch
                checked={business?.handoff_enabled !== false}
                onCheckedChange={(v) => void setBusinessField({ handoff_enabled: v })}
                label="Allow handoff"
              />
            </div>

            <div className="flex items-center gap-2">
              <Button size="sm" onClick={saveHandoff} disabled={savingHandoff || handoff === (business?.handoff_number ?? '')}>
                {savingHandoff ? 'Saving…' : 'Save number'}
              </Button>
              {!business?.handoff_number && (
                <span className="text-[12px] text-muted">
                  Without a number, KONEK offers a callback instead.
                </span>
              )}
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
            <Badge tone="solid">
              {business ? `${business.plan[0].toUpperCase()}${business.plan.slice(1)}` : '—'} · {planPrice}
            </Badge>
          </div>

          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <div>
              <div className="mb-2 flex items-baseline justify-between text-[12px]">
                <span className="text-muted">Calls used</span>
                <span className="tabular-nums text-ink">{used.toLocaleString()} / {limit.toLocaleString()}</span>
              </div>
              <Progress value={used} max={limit} tone="auto" />
              <p className="mt-3 text-[12px] text-muted">Resets on the 1st. Overage is $0.09 per call.</p>
            </div>
            <div className="space-y-3 text-[13px]">
              <div className="flex items-center justify-between">
                <span className="text-muted">Next invoice</span>
                <span className="tabular-nums text-ink">{business?.mrr ? `$${business.mrr}.00` : '—'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">Billing email</span>
                <span className="text-ink">{business?.owner_email ?? '—'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">Business ID</span>
                <span className="font-mono text-[11px] text-muted">{business?.id.slice(0, 8)}…</span>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-2 border-t border-line pt-5">
            <Button
              size="sm"
              onClick={async () => {
                const res = await tryApi(() => api.checkout('pro'));
                if (res?.url) window.location.href = res.url;
              }}
            >
              Upgrade plan
            </Button>
            <Button size="sm" variant="secondary" disabled title="Connect Stripe to manage payment methods">
              Manage payment
            </Button>
            <Button size="sm" variant="ghost" disabled title="Connect Stripe to download invoices">
              Download invoices
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
