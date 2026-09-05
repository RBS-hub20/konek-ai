'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity, Building2, CreditCard, LayoutDashboard, Megaphone, Menu,
  PhoneCall, Settings as SettingsIcon, X,
} from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import { StatusDot } from '@/components/ui/Badge';
import { useSuperAdmin } from './SuperAdminData';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/super-admin/overview', label: 'Overview', icon: LayoutDashboard },
  { href: '/super-admin/tenants', label: 'All Tenants', icon: Building2, count: 'tenants' as const },
  { href: '/super-admin/numbers', label: 'Number Pool', icon: PhoneCall },
  {
    href: '/super-admin/outbound',
    label: 'Outbound Sales',
    icon: Megaphone,
    badge: 'New',
    children: ['Leads', 'Call Campaigns', 'Country-Aware'],
  },
  { href: '/super-admin/activity', label: 'Activity', icon: Activity },
  { href: '/super-admin/billing', label: 'Billing & MRR', icon: CreditCard },
  { href: '/super-admin/settings', label: 'Schema Health', icon: SettingsIcon, warn: true },
];

const SERVICES = [
  { name: 'Supabase', key: 'supabase' },
  { name: 'Twilio', key: 'twilio' },
  { name: 'Cartesia', key: 'cartesia' },
  { name: 'Bridge', key: 'mediaBridge' },
];

export function SuperAdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { businesses, services, schema, duplicates } = useSuperAdmin();
  const [navOpen, setNavOpen] = useState(false);

  const schemaBroken = schema?.healthy === false;

  return (
    /* RBS Labs console — dark regardless of the user's theme. */
    <div className="dark flex min-h-screen bg-paper text-ink">
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-60 shrink-0 flex-col border-r border-line bg-paper transition-transform duration-200 lg:static lg:translate-x-0',
          navOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-line px-5">
          <Link href="/" className="focus-ring rounded-brand">
            <Logo size="sm" />
          </Link>
          <button
            type="button"
            onClick={() => setNavOpen(false)}
            aria-label="Close navigation"
            className="rounded p-1 text-muted lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-line px-5 py-3">
          <span className="rounded-full border border-line px-2.5 py-1 text-[10px] font-medium uppercase tracking-brand text-muted">
            Super Admin
          </span>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {NAV.map((n) => {
            const active = pathname === n.href || pathname.startsWith(`${n.href}/`);
            return (
              <div key={n.href}>
                <Link
                  href={n.href}
                  onClick={() => setNavOpen(false)}
                  className={cn(
                    'flex items-center gap-3 rounded-brand px-3 py-2.5 text-[13px] font-medium transition-colors focus-ring',
                    active ? 'bg-surface text-ink' : 'text-muted hover:bg-surface hover:text-ink'
                  )}
                >
                  <n.icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1">{n.label}</span>
                  {n.count === 'tenants' && businesses.length > 0 && (
                    <span className="rounded-full bg-ink px-1.5 py-0.5 text-[10px] tabular-nums text-paper">
                      {businesses.length}
                    </span>
                  )}
                  {n.badge && (
                    <span className="rounded-full border border-accent px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-accent">
                      {n.badge}
                    </span>
                  )}
                  {/* A broken schema is the thing most likely to be silently wrong. */}
                  {n.warn && schemaBroken && <StatusDot tone="danger" />}
                  {n.href.endsWith('/tenants') && duplicates > 0 && <StatusDot tone="warning" />}
                </Link>

                {n.children && active && (
                  <ul className="mb-1 ml-7 space-y-0.5 border-l border-line pl-3">
                    {n.children.map((c) => (
                      <li key={c} className="py-1 text-[12px] text-muted">{c}</li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </nav>

        <div className="border-t border-line p-3">
          <div className="mb-3 space-y-1.5 px-2">
            {SERVICES.map((s) => (
              <div key={s.key} className="flex items-center gap-2 text-[11px] text-muted">
                <StatusDot tone={services[s.key] ? 'success' : 'danger'} />
                {s.name}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2.5 border-t border-line px-2 pt-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-full border border-line text-[10px] font-medium text-ink">
              RB
            </span>
            <div className="min-w-0">
              <div className="truncate text-[12px] font-medium text-ink">RBS Labs</div>
              <div className="text-[10px] text-muted">Super Admin</div>
            </div>
          </div>
        </div>
      </aside>

      {navOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setNavOpen(false)} aria-hidden />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-line bg-paper/85 px-5 backdrop-blur-md md:px-8">
          <button
            type="button"
            onClick={() => setNavOpen(true)}
            aria-label="Open navigation"
            className="rounded p-1 text-muted lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
          <h1 className="font-display text-[14px] font-semibold text-ink">
            {NAV.find((n) => pathname.startsWith(n.href))?.label ?? 'Overview'}
          </h1>
          <Link href="/admin" className="ml-auto text-[12px] text-muted transition-colors hover:text-ink">
            Business dashboard
          </Link>
        </header>

        <main className="flex-1 px-5 py-8 md:px-8">{children}</main>
      </div>
    </div>
  );
}
