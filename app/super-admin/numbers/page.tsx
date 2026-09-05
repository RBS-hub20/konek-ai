'use client';

import { NumberPool } from '@/components/super-admin/NumberPool';
import { useSuperAdmin } from '@/components/super-admin/SuperAdminData';

export default function NumbersPage() {
  const { businesses, loading, reload } = useSuperAdmin();
  if (loading) return <p className="py-20 text-[13px] text-muted">Loading…</p>;
  return <NumberPool businesses={businesses} onChanged={reload} />;
}
