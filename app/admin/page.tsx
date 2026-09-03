'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Blocks,
  BookOpen,
  LayoutDashboard,
  Menu,
  Mic2,
  Phone,
  Settings as SettingsIcon,
  Sparkles,
  Megaphone,
  X,
} from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { OverviewTab } from '@/components/admin/OverviewTab';
import { CampaignsTab } from '@/components/admin/CampaignsTab';
import { BusinessBrainTab } from '@/components/admin/BusinessBrainTab';
import { SkillsLibraryTab } from '@/components/admin/SkillsLibraryTab';
import { VibeModeTab } from '@/components/admin/VibeModeTab';
import { CallLogsTab } from '@/components/admin/CallLogsTab';
import { IntegrationsTab } from '@/components/admin/IntegrationsTab';
import { SettingsTab } from '@/components/admin/SettingsTab';
import { useKonekStore } from '@/lib/store';
import { cn } from '@/lib/utils';

const NAV = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'campaigns', label: 'Campaigns', icon: Megaphone },
  { id: 'brain', label: 'Business Brain', icon: BookOpen },
  { id: 'skills', label: 'Skills Library', icon: Sparkles },
  { id: 'vibe', label: 'Vibe Mode', icon: Mic2 },
  { id: 'logs', label: 'Call Logs', icon: Phone },
  { id: 'integrations', label: 'Integrations', icon: Blocks },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
] as const;

type TabId = (typeof NAV)[number]['id'];

export default function AdminPage() {
  const [tab, setTab] = useState<TabId>('overview');
  const [navOpen, setNavOpen] = useState(false);

  /* The store rehydrates from localStorage on the client — wait for it so
     server and client markup never disagree, then pull live state from the API. */
  const [ready, setReady] = useState(false);
  const hydrateFromServer = useKonekStore((s) => s.hydrateFromServer);
  useEffect(() => {
    setReady(true);
    void hydrateFromServer();
  }, [hydrateFromServer]);

  const profileName = useKonekStore((s) => s.profile.name);
  const activeCount = useKonekStore((s) => s.activeSkills.length);

  if (!ready) return <LoadingScreen label="Loading your dashboard" />;

  const current = NAV.find((n) => n.id === tab)!;

  return (
    <div className="flex min-h-screen bg-paper">
      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col border-r border-line bg-paper transition-transform duration-200 lg:static lg:translate-x-0',
          navOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-line px-5">
          <Link href="/" className="focus-ring rounded-brand">
            <Logo size="md" />
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

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {NAV.map((n) => {
            const active = n.id === tab;
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => {
                  setTab(n.id);
                  setNavOpen(false);
                }}
                className={cn(
                  'flex w-full items-center gap-3 rounded-brand px-3 py-2.5 text-[13px] font-medium transition-colors focus-ring',
                  active ? 'bg-surface text-ink' : 'text-muted hover:bg-surface hover:text-ink'
                )}
              >
                <n.icon className="h-4 w-4 shrink-0" />
                <span className="flex-1 text-left">{n.label}</span>
                {n.id === 'skills' && activeCount > 0 && (
                  <span className="rounded-full bg-ink px-1.5 py-0.5 text-[10px] tabular-nums text-paper">
                    {activeCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-line p-3">
          <div className="mb-3 flex items-center gap-3 px-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full border border-line text-[11px] font-medium text-ink">
              {profileName.slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0">
              <div className="truncate text-[12px] font-medium text-ink">{profileName}</div>
              <div className="text-[11px] text-muted">Pro plan</div>
            </div>
          </div>
          <ThemeToggle withLabel className="w-full justify-center" />
        </div>
      </aside>

      {/* Backdrop for mobile nav */}
      {navOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setNavOpen(false)}
          aria-hidden
        />
      )}

      {/* ── Main ────────────────────────────────────────────────── */}
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
          <h1 className="font-display text-[14px] font-semibold text-ink">{current.label}</h1>
          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/super-admin"
              className="hidden text-[12px] text-muted transition-colors hover:text-ink sm:block"
            >
              Super Admin
            </Link>
          </div>
        </header>

        <main className="flex-1 px-5 py-8 md:px-8 md:py-10">
          {tab === 'overview' && <OverviewTab />}
          {tab === 'campaigns' && <CampaignsTab />}
          {tab === 'brain' && <BusinessBrainTab />}
          {tab === 'skills' && <SkillsLibraryTab />}
          {tab === 'vibe' && <VibeModeTab />}
          {tab === 'logs' && <CallLogsTab />}
          {tab === 'integrations' && <IntegrationsTab />}
          {tab === 'settings' && <SettingsTab />}
        </main>
      </div>
    </div>
  );
}
