'use client';

import { BillingTab } from '@/components/super-admin/Billing';
import { useSuperAdmin } from '@/components/super-admin/SuperAdminData';

export default function BillingPage() {
  const { businesses, loading } = useSuperAdmin();
  if (loading) return <p className="py-20 text-[13px] text-muted">Loading…</p>;
  return <BillingTab businesses={businesses} />;
}
