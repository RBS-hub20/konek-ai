'use client';

import { ActivityTab } from '@/components/super-admin/Activity';
import { useSuperAdmin } from '@/components/super-admin/SuperAdminData';

export default function ActivityPage() {
  const { calls, businesses, loading } = useSuperAdmin();
  if (loading) return <p className="py-20 text-[13px] text-muted">Loading…</p>;
  return <ActivityTab calls={calls} businesses={businesses} />;
}
