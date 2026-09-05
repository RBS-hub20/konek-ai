'use client';

import { Building2, DollarSign, Flame, PhoneCall } from 'lucide-react';
import { StatCard } from '@/components/ui/StatCard';
import { TenantsTable } from '@/components/super-admin/TenantsTable';
import { LiveFeed } from '@/components/super-admin/LiveFeed';
import { NewBusinessDialog } from '@/components/super-admin/NewBusinessDialog';
import { SchemaBanner } from '@/components/super-admin/SchemaBanner';
import { useSuperAdmin } from '@/components/super-admin/SuperAdminData';
import { formatCurrency, formatDuration, formatNumber } from '@/lib/utils';
import { useState } from 'react';

export default function OverviewPage() {
  const { stats, businesses, calls, duplicates, loading, reload } = useSuperAdmin();
  const [showNew, setShowNew] = useState(false);

  if (loading) return <p className="py-20 text-[13px] text-muted">Loading tenants…</p>;

  return (
    <div className="space-y-8">
      <SchemaBanner />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total MRR" value={formatCurrency(stats.mrr)} delta={`${stats.total} tenant${stats.total === 1 ? '' : 's'}`} icon={<DollarSign className="h-4 w-4" />} />
        <StatCard
          label="Active Businesses"
          value={String(stats.active)}
          delta={duplicates ? `${stats.total} distinct · ${duplicates} duplicate row${duplicates === 1 ? '' : 's'}` : `${stats.total} total`}
          icon={<Building2 className="h-4 w-4" />}
        />
        <StatCard
          label="Total Calls"
          value={formatNumber(stats.connectedCalls ?? stats.totalCalls)}
          delta={`${formatNumber(stats.totalCalls)} placed · ${formatDuration(stats.answeredSeconds ?? 0)} talk time`}
          icon={<PhoneCall className="h-4 w-4" />}
        />
        <StatCard label="Hot Leads" value={formatNumber(stats.hotLeads)} delta="All time" accent icon={<Flame className="h-4 w-4" />} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <TenantsTable businesses={businesses} duplicates={duplicates} onChanged={reload} onNew={() => setShowNew(true)} />
        <LiveFeed calls={calls} />
      </div>

      <NewBusinessDialog open={showNew} onClose={() => setShowNew(false)} onCreated={reload} />
    </div>
  );
}
