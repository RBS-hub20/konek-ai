'use client';

import { useState } from 'react';
import { TenantsTable } from '@/components/super-admin/TenantsTable';
import { NewBusinessDialog } from '@/components/super-admin/NewBusinessDialog';
import { SchemaBanner } from '@/components/super-admin/SchemaBanner';
import { useSuperAdmin } from '@/components/super-admin/SuperAdminData';

export default function TenantsPage() {
  const { businesses, duplicates, loading, reload } = useSuperAdmin();
  const [showNew, setShowNew] = useState(false);

  if (loading) return <p className="py-20 text-[13px] text-muted">Loading tenants…</p>;

  return (
    <div className="space-y-6">
      <SchemaBanner />
      <TenantsTable businesses={businesses} duplicates={duplicates} onChanged={reload} onNew={() => setShowNew(true)} />
      <NewBusinessDialog open={showNew} onClose={() => setShowNew(false)} onCreated={reload} />
    </div>
  );
}
