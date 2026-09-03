'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Vibe } from './mockData';
import { TRIGGER_OPTIONS, VIBES } from './mockData';
import { api, tryApi, type ServerCustomSkill } from './apiClient';

export interface CustomSkill {
  id: string;
  name: string;
  description: string;
  trigger: (typeof TRIGGER_OPTIONS)[number] | string;
  vibe: Vibe;
  createdAt: string;
}

export interface BusinessProfile {
  name: string;
  sells: string;
  price: string;
}

export type Goal = 'Explain' | 'Book' | 'Close';

interface KonekState {
  /* Server sync */
  businessId: string | null;
  serverLive: boolean;
  hydrated: boolean;
  syncError: string | null;
  hydrateFromServer: () => Promise<void>;

  /* Vibe Mode */
  vibe: Vibe;
  setVibe: (v: Vibe) => void;

  /* Skills Library */
  activeSkills: string[];
  toggleSkill: (id: string) => void;
  isSkillActive: (id: string) => boolean;

  /* Custom Skill Builder */
  customSkills: CustomSkill[];
  addCustomSkill: (s: Omit<CustomSkill, 'id' | 'createdAt'>) => void;
  updateCustomSkill: (id: string, patch: Partial<CustomSkill>) => void;
  removeCustomSkill: (id: string) => void;

  /* Business Brain */
  profile: BusinessProfile;
  setProfile: (p: Partial<BusinessProfile>) => void;
  knowledge: string[];
  addKnowledge: (name: string) => void;
  removeKnowledge: (name: string) => void;
  goal: Goal;
  setGoal: (g: Goal) => void;

  /* Knowledge sources come back from /api/brain once hydrated */
  setKnowledge: (names: string[]) => void;

  /* Settings */
  twilioNumber: string;
  setTwilioNumber: (n: string) => void;
  whatsapp: boolean;
  setWhatsapp: (v: boolean) => void;
}

export const useKonekStore = create<KonekState>()(
  persist(
    (set, get) => ({
      businessId: null,
      serverLive: false,
      hydrated: false,
      syncError: null,

      /* Pulls the real state out of the API. Falls back silently to whatever
         is already in localStorage if the backend is unreachable. */
      hydrateFromServer: async () => {
        const skills = await tryApi(() => api.skills());
        if (!skills) {
          set({ hydrated: true, syncError: 'Backend unreachable — using local data.' });
          return;
        }
        const businessId = skills.businessId;
        const [custom, biz, brain] = await Promise.all([
          tryApi(() => api.customSkills(businessId)),
          tryApi(() => api.currentBusiness()),
          tryApi(() => api.brain(businessId)),
        ]);

        set({
          businessId,
          serverLive: skills.live,
          hydrated: true,
          syncError: null,
          activeSkills: skills.skills.filter((s) => s.enabled).map((s) => s.id),
          ...(custom ? { customSkills: custom.customSkills.map(fromServerCustomSkill) } : {}),
          ...(brain ? { knowledge: brain.sources.map((s) => s.source) } : {}),
          ...(biz?.business
            ? {
                profile: {
                  name: biz.business.name,
                  sells: biz.business.what_you_sell ?? '',
                  price: biz.business.price ?? '',
                },
                goal: (biz.business.goal
                  ? ((biz.business.goal[0].toUpperCase() + biz.business.goal.slice(1)) as Goal)
                  : get().goal),
                vibe: (VIBES.includes(biz.business.vibe as Vibe) ? (biz.business.vibe as Vibe) : get().vibe),
                twilioNumber: biz.business.twilio_number ?? get().twilioNumber,
                whatsapp: biz.business.whatsapp_enabled ?? get().whatsapp,
              }
            : {}),
        });
      },

      vibe: 'PRO CLOSER',
      setVibe: (vibe) => {
        set({ vibe });
        const id = get().businessId;
        if (id) void tryApi(() => api.updateBusiness(id, { vibe }));
      },

      activeSkills: ['booking', 'faq'],
      toggleSkill: (id) => {
        const wasOn = get().activeSkills.includes(id);
        const next = wasOn
          ? get().activeSkills.filter((x) => x !== id)
          : [...get().activeSkills, id];
        set({ activeSkills: next });
        /* Write through; put the toggle back if the server rejects it. */
        void api.toggleSkill(id, !wasOn, get().businessId ?? undefined).catch(() => {
          set({ activeSkills: get().activeSkills.filter((x) => x !== id).concat(wasOn ? [id] : []) });
        });
      },
      isSkillActive: (id) => get().activeSkills.includes(id),

      customSkills: [
        {
          id: 'cs-seed-1',
          name: 'Dubai Delivery Objection',
          description:
            "When the customer says it's expensive, mention we have 3-month installment and free delivery anywhere in Dubai.",
          trigger: 'When customer says...',
          vibe: 'PRO CLOSER',
          createdAt: '2 days ago',
        },
      ],
      addCustomSkill: (s) => {
        const optimistic: CustomSkill = { ...s, id: `cs-${Date.now().toString(36)}`, createdAt: 'Just now' };
        set((state) => ({ customSkills: [optimistic, ...state.customSkills] }));
        void api
          .createCustomSkill({
            name: s.name,
            description: s.description,
            trigger_type: String(s.trigger),
            vibe: s.vibe,
            business_id: get().businessId ?? undefined,
          })
          .then((r) =>
            /* Swap the optimistic row for the stored one so Delete hits a real id. */
            set((state) => ({
              customSkills: state.customSkills.map((c) =>
                c.id === optimistic.id ? fromServerCustomSkill(r.customSkill) : c
              ),
            }))
          )
          .catch(() => {});
      },
      updateCustomSkill: (id, patch) =>
        set((state) => ({
          customSkills: state.customSkills.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        })),
      removeCustomSkill: (id) => {
        set((state) => ({ customSkills: state.customSkills.filter((c) => c.id !== id) }));
        void tryApi(() => api.deleteCustomSkill(id));
      },

      profile: {
        name: 'Nova Aesthetics',
        sells: 'Skin treatments, facials and aftercare packages',
        price: '₱2,500 – ₱12,800',
      },
      setProfile: (p) => {
        set((s) => ({ profile: { ...s.profile, ...p } }));
        const id = get().businessId;
        if (!id) return;
        clearTimeout(profileTimer);
        profileTimer = setTimeout(() => {
          const { name, sells, price } = get().profile;
          void tryApi(() => api.updateBusiness(id, { name, what_you_sell: sells, price }));
        }, 600);
      },

      knowledge: ['price-list-2025.pdf', 'services-menu.pdf', 'novaaesthetics.ph'],
      addKnowledge: (name) =>
        set((s) => (s.knowledge.includes(name) ? s : { knowledge: [...s.knowledge, name] })),
      removeKnowledge: (name) => {
        set((s) => ({ knowledge: s.knowledge.filter((k) => k !== name) }));
        void tryApi(() => api.deleteBrainSource(name, get().businessId ?? undefined));
      },
      setKnowledge: (names) => set({ knowledge: names }),

      goal: 'Book',
      setGoal: (goal) => {
        set({ goal });
        const id = get().businessId;
        if (id) void tryApi(() => api.updateBusiness(id, { goal: goal.toLowerCase() as 'explain' | 'book' | 'close' }));
      },

      twilioNumber: '+63 917 000 8642',
      setTwilioNumber: (twilioNumber) => {
        set({ twilioNumber });
        const id = get().businessId;
        if (id) void tryApi(() => api.updateBusiness(id, { twilio_number: twilioNumber }));
      },
      whatsapp: true,
      setWhatsapp: (whatsapp) => {
        set({ whatsapp });
        const id = get().businessId;
        if (id) void tryApi(() => api.updateBusiness(id, { whatsapp_enabled: whatsapp }));
      },
    }),
    {
      name: 'konek-ai-store',
      /* Server-owned flags must never be restored from localStorage. */
      partialize: (s) => {
        const { hydrated, syncError, serverLive, businessId, ...rest } = s;
        return rest as KonekState;
      },
    }
  )
);

let profileTimer: ReturnType<typeof setTimeout>;

function fromServerCustomSkill(c: ServerCustomSkill): CustomSkill {
  return {
    id: c.id,
    name: c.name,
    description: c.description ?? '',
    trigger: c.trigger_type ?? 'When customer says...',
    vibe: (VIBES.includes(c.vibe as Vibe) ? (c.vibe as Vibe) : 'PRO CLOSER'),
    createdAt: relativeTime(c.created_at),
  };
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff) || diff < 0) return 'Just now';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
