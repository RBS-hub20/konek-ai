'use client';

import { create } from 'zustand';
import { api, tryApi, type ApiError } from './apiClient';
import type {
  Business, BusinessBrain, CallLog, Campaign, OverviewStats, SkillRecord,
} from './types2';
import { vibeToKey, type VibeKey } from './types2';

/* Single source of truth for the dashboard. Everything here comes from the
   API — there is no mock data left in the client. */

interface KonekState {
  /* Bootstrap */
  hydrated: boolean;
  loadError: string | null;
  hydrate: () => Promise<void>;

  /* Tenant */
  business: Business | null;
  businessId: string | null;
  setBusinessField: (patch: Partial<Business>) => Promise<void>;

  /* Live-call gate */
  unlocked: boolean;
  unlockRequired: boolean;
  liveCallsEnabled: boolean;
  refreshSession: () => Promise<void>;
  unlock: (key: string) => Promise<void>;

  /* Overview */
  stats: OverviewStats;
  recentCalls: CallLog[];
  runningCampaigns: Campaign[];
  setup: { vibe: string; activeSkills: number; customSkills: number; callsUsed: number; callsLimit: number; goal: string } | null;
  loadOverview: () => Promise<void>;

  /* Skills */
  skills: SkillRecord[];
  loadSkills: () => Promise<void>;
  toggleSkill: (id: string) => Promise<void>;
  addSkill: (input: { name: string; description: string; category?: string; vibe?: string; script?: string }) => Promise<void>;
  removeSkill: (id: string) => Promise<void>;

  /* Business Brain */
  brain: BusinessBrain | null;
  loadBrain: () => Promise<void>;
  saveBrain: (patch: Partial<BusinessBrain>) => Promise<void>;

  /* Campaigns */
  campaigns: Campaign[];
  loadCampaigns: () => Promise<void>;

  /* Call logs */
  calls: CallLog[];
  loadCalls: () => Promise<void>;

  /* Vibe */
  vibe: VibeKey;
  setVibe: (v: string) => Promise<void>;
}

const EMPTY_STATS: OverviewStats = { callsToday: 0, connectedPct: 0, hotLeads: 0, bookings: 0 };

export const useKonekStore = create<KonekState>()((set, get) => ({
  hydrated: false,
  loadError: null,

  hydrate: async () => {
    const [bizRes, session] = await Promise.all([
      tryApi(() => api.currentBusiness()),
      tryApi(() => api.session()),
    ]);

    if (!bizRes?.business) {
      set({ hydrated: true, loadError: 'Could not load your business. Is the database reachable?' });
      return;
    }

    const business = bizRes.business;
    set({
      business,
      businessId: business.id,
      vibe: vibeToKey(business.active_vibe),
      unlocked: session?.unlocked ?? false,
      unlockRequired: session?.unlockRequired ?? false,
      liveCallsEnabled: session?.liveCallsEnabled ?? false,
      hydrated: true,
      loadError: null,
    });

    await Promise.all([
      get().loadOverview(), get().loadSkills(), get().loadBrain(),
      get().loadCampaigns(), get().loadCalls(),
    ]);
  },

  business: null,
  businessId: null,

  setBusinessField: async (patch) => {
    const id = get().businessId;
    if (!id) return;
    const previous = get().business;
    set({ business: previous ? { ...previous, ...patch } : previous }); // optimistic
    try {
      const { business } = await api.updateBusiness(id, patch);
      set({ business, vibe: vibeToKey(business.active_vibe) });
    } catch {
      set({ business: previous }); // put it back
      throw new Error('Could not save. Check your connection and try again.');
    }
  },

  unlocked: false,
  unlockRequired: false,
  liveCallsEnabled: false,

  refreshSession: async () => {
    const s = await tryApi(() => api.session());
    if (s) set({ unlocked: s.unlocked, unlockRequired: s.unlockRequired, liveCallsEnabled: s.liveCallsEnabled });
  },

  unlock: async (key) => {
    await api.unlock(key);
    await get().refreshSession();
  },

  stats: EMPTY_STATS,
  recentCalls: [],
  runningCampaigns: [],
  setup: null,

  loadOverview: async () => {
    const res = await tryApi(() => api.overview(get().businessId ?? undefined));
    if (!res) return;
    set({
      stats: res.stats,
      recentCalls: res.recentCalls,
      runningCampaigns: res.campaigns,
      setup: res.setup,
      ...(res.business ? { business: res.business } : {}),
    });
  },

  skills: [],
  loadSkills: async () => {
    const res = await tryApi(() => api.skills(get().businessId ?? undefined));
    if (res) set({ skills: res.skills });
  },

  toggleSkill: async (id) => {
    const current = get().skills;
    const target = current.find((s) => s.id === id);
    if (!target) return;
    const next = !target.is_active;
    set({ skills: current.map((s) => (s.id === id ? { ...s, is_active: next } : s)) });
    try {
      await api.toggleSkill(id, next, get().businessId ?? undefined);
    } catch {
      set({ skills: current }); // revert
    }
  },

  addSkill: async (input) => {
    await api.createSkill(input, get().businessId ?? undefined);
    await get().loadSkills();
  },

  removeSkill: async (id) => {
    const before = get().skills;
    set({ skills: before.filter((s) => s.id !== id) });
    try {
      await api.deleteSkill(id, get().businessId ?? undefined);
    } catch {
      set({ skills: before });
    }
  },

  brain: null,
  loadBrain: async () => {
    const res = await tryApi(() => api.brain(get().businessId ?? undefined));
    if (res) set({ brain: res.brain });
  },

  saveBrain: async (patch) => {
    const before = get().brain;
    set({ brain: before ? { ...before, ...patch } : before });
    try {
      const { brain } = await api.saveBrain({ ...patch, businessId: get().businessId ?? undefined });
      set({ brain });
    } catch {
      set({ brain: before });
      throw new Error('Could not save the Business Brain.');
    }
  },

  campaigns: [],
  loadCampaigns: async () => {
    const res = await tryApi(() => api.campaigns(get().businessId ?? undefined));
    if (res) set({ campaigns: res.campaigns });
  },

  calls: [],
  loadCalls: async () => {
    const res = await tryApi(() => api.calls(get().businessId ?? undefined));
    if (res) set({ calls: res.calls });
  },

  vibe: 'PRO_CLOSER',
  setVibe: async (v) => {
    const vibe = vibeToKey(v);
    set({ vibe });
    await get().setBusinessField({ active_vibe: vibe });
  },
}));

/** True when a failed request was rejected for want of the operator unlock. */
export const needsUnlock = (err: unknown): boolean =>
  Boolean((err as ApiError)?.needsUnlock);
