'use client';

import { Globe2, Megaphone, Phone, Users } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { useSuperAdmin } from '@/components/super-admin/SuperAdminData';

/* Skeleton for the outbound lead caller. Everything here is scaffolding —
   labelled as such rather than shown as working numbers, so nobody demos a
   figure that is not real. */

const SECTIONS = [
  {
    icon: Users,
    title: 'Leads',
    body: 'Import lead lists by CSV or from a CRM, deduplicate on phone number, and track which have been contacted.',
    status: 'Planned',
  },
  {
    icon: Phone,
    title: 'Call Campaigns',
    body: 'Batch dialling across tenants with pacing, retries and per-campaign vibes. The per-business version already runs on /admin → Campaigns.',
    status: 'Partly built',
  },
  {
    icon: Globe2,
    title: 'Country-Aware Routing',
    body: 'Pick the outbound number, language and calling window from the lead country — Manila leads dialled from a PH number in Taglish, Dubai leads from a UAE number in Arabic or English.',
    status: 'Planned',
  },
];

export default function OutboundPage() {
  const { businesses } = useSuperAdmin();

  return (
    <div className="space-y-6">
      <div className="rounded-brand border border-line bg-paper p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-brand border border-line">
            <Megaphone className="h-4 w-4 text-ink" />
          </span>
          <div>
            <h1 className="font-display text-[18px] font-semibold tracking-tight text-ink">
              Cindy AI — Outbound Sales
            </h1>
            <p className="mt-0.5 text-[12px] text-muted">Not built yet · scaffolding only</p>
          </div>
          <Badge tone="accent" className="ml-auto">Coming next</Badge>
        </div>

        <p className="mt-5 max-w-2xl text-[13px] leading-relaxed text-muted">
          KONEK currently calls a business&apos;s own customers. Outbound Sales points the same engine at new
          leads: a list goes in, Cindy works it, and country determines the number she calls from and the
          language she opens in.
        </p>

        <p className="mt-4 text-[12px] text-muted">
          The pieces already in place: the media bridge holds a real conversation, language is detected and
          followed mid-call, and per-business campaigns dial contact lists. What is missing is the lead
          store, cross-tenant pacing, and the country routing table.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {SECTIONS.map((s) => (
          <section key={s.title} className="flex flex-col rounded-brand border border-line bg-paper p-5">
            <div className="flex items-start justify-between gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-brand border border-line">
                <s.icon className="h-4 w-4 text-ink" />
              </span>
              <Badge tone={s.status === 'Partly built' ? 'accent' : 'default'}>{s.status}</Badge>
            </div>
            <h2 className="mt-4 font-display text-[14px] font-semibold text-ink">{s.title}</h2>
            <p className="mt-2 flex-1 text-[12.5px] leading-relaxed text-muted">{s.body}</p>
          </section>
        ))}
      </div>

      <section className="rounded-brand border border-line bg-paper p-5">
        <h2 className="font-display text-[14px] font-semibold text-ink">Country routing, as planned</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left">
            <thead>
              <tr className="border-b border-line text-[11px] uppercase tracking-wide text-muted">
                <th className="py-2 pr-4 font-medium">Lead country</th>
                <th className="py-2 pr-4 font-medium">Dials from</th>
                <th className="py-2 pr-4 font-medium">Opens in</th>
                <th className="py-2 font-medium">Local window</th>
              </tr>
            </thead>
            <tbody className="text-[13px]">
              {[
                ['🇵🇭 Philippines', 'PH number', 'Taglish', '9am – 7pm PHT'],
                ['🇦🇪 UAE', 'UAE number', 'Arabic or English', '10am – 8pm GST'],
                ['🇺🇸 United States', `${businesses[0]?.outbound_number ?? 'US number'}`, 'English', '9am – 6pm local'],
              ].map(([c, from, lang, win]) => (
                <tr key={c} className="border-b border-line last:border-0">
                  <td className="py-2.5 pr-4 text-ink">{c}</td>
                  <td className="py-2.5 pr-4 font-mono text-[12px] text-muted">{from}</td>
                  <td className="py-2.5 pr-4 text-muted">{lang}</td>
                  <td className="py-2.5 text-muted">{win}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-[11px] text-muted">Illustrative — none of this routing is wired yet.</p>
      </section>
    </div>
  );
}
