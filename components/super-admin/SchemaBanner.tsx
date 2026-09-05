'use client';

import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { useSuperAdmin } from './SuperAdminData';

/**
 * A half-migrated schema is invisible at write time — unknown columns are
 * dropped so calls keep working — so it has to be said out loud.
 */
export function SchemaBanner() {
  const { schema } = useSuperAdmin();
  if (!schema || schema.healthy !== false) return null;

  return (
    <div className="rounded-brand border border-line bg-surface p-4">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
        <span className="text-[13px] font-medium text-ink">Database schema is incomplete</span>
      </div>
      <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
        Calls still connect, but anything stored in a missing column is silently dropped — which is why
        durations read 0:00 and phone numbers show as “—”.
      </p>
      <Link href="/super-admin/settings" className="mt-2 inline-block text-[12px] text-accent hover:underline">
        See what is missing →
      </Link>
    </div>
  );
}
