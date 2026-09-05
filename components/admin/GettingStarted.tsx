'use client';

import { Check, ChevronRight, Circle } from 'lucide-react';
import { useKonekStore } from '@/lib/store';
import { LANGUAGES, languageToKey } from '@/lib/ai/languages';
import { VIBE_CONFIG } from '@/lib/ai/vibes';
import { vibeToKey } from '@/lib/types2';
import { cn } from '@/lib/utils';

/**
 * What is left before this business can actually take calls.
 *
 * Every step is derived from real state rather than a stored checklist, so it
 * cannot drift out of sync with the account, and it disappears once there is
 * nothing left to do.
 */
export function GettingStarted({ onGo }: { onGo: (tab: string) => void }) {
  const { business, brain, skills, calls } = useKonekStore();

  const activeSkills = skills.filter((s) => s.is_active).length;
  const knowledge = brain?.knowledge_files?.length ?? 0;
  const hasProfile = Boolean(brain?.what_you_sell?.trim());

  const steps = [
    {
      id: 'brain',
      tab: 'brain',
      title: 'Tell KONEK what you sell',
      done: hasProfile,
      todo: 'It cannot quote or book without knowing the business.',
      did: brain?.what_you_sell ?? '',
    },
    {
      id: 'knowledge',
      tab: 'brain',
      title: 'Add your prices or menu',
      done: knowledge > 0,
      todo: 'Upload a price list or paste your website — KONEK only states facts it has been given.',
      did: `${knowledge} source${knowledge === 1 ? '' : 's'} indexed`,
    },
    {
      id: 'number',
      tab: 'settings',
      title: 'Set your outbound number',
      done: Boolean(business?.outbound_number),
      todo: 'The number customers will see when KONEK calls.',
      did: business?.outbound_number ?? '',
    },
    {
      id: 'vibe',
      tab: 'vibe',
      title: 'Choose a vibe and language',
      done: Boolean(business?.active_vibe),
      todo: 'How KONEK sounds, and which language it opens in.',
      did: business
        ? `${VIBE_CONFIG[vibeToKey(business.active_vibe)].label} · ${LANGUAGES[languageToKey(business.language)].label}`
        : '',
    },
    {
      id: 'skills',
      tab: 'skills',
      title: 'Switch on the skills you need',
      done: activeSkills > 0,
      todo: 'Booking and FAQ are enough to start.',
      did: `${activeSkills} active`,
    },
    {
      id: 'handoff',
      tab: 'settings',
      title: 'Add a human handoff number',
      done: Boolean(business?.handoff_number),
      todo: 'Where to transfer a caller who asks for a person. Optional, but callers ask.',
      did: business?.handoff_number ?? '',
      optional: true,
    },
    {
      id: 'testcall',
      tab: 'vibe',
      title: 'Call yourself to hear it',
      done: calls.length > 0,
      todo: 'Vibe Mode → Test call myself. Hear exactly what a customer hears.',
      did: `${calls.length} call${calls.length === 1 ? '' : 's'} placed`,
    },
  ];

  const required = steps.filter((s) => !s.optional);
  const remaining = required.filter((s) => !s.done);

  /* Nothing left to nag about. */
  if (remaining.length === 0) return null;

  const doneCount = required.length - remaining.length;

  return (
    <section className="rounded-brand border border-line bg-paper p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="font-display text-[15px] font-semibold text-ink">Get KONEK ready</h2>
          <p className="mt-1 text-[12px] text-muted">
            {doneCount} of {required.length} done — {remaining.length} step{remaining.length === 1 ? '' : 's'} left before
            it can take a real call.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {required.map((s) => (
            <span
              key={s.id}
              className={cn('h-1.5 w-6 rounded-full', s.done ? 'bg-accent' : 'bg-line')}
              aria-hidden
            />
          ))}
        </div>
      </div>

      <ul className="mt-5 divide-y divide-line border-t border-line">
        {steps.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => onGo(s.tab)}
              className="flex w-full items-center gap-3.5 py-3.5 text-left transition-colors hover:bg-surface focus-ring"
            >
              {s.done
                ? <Check className="h-4 w-4 shrink-0 text-accent" />
                : <Circle className="h-4 w-4 shrink-0 text-muted" />}
              <span className="min-w-0 flex-1">
                <span className={cn('block text-[13px]', s.done ? 'text-muted line-through' : 'font-medium text-ink')}>
                  {s.title}
                  {s.optional && !s.done && <span className="ml-2 text-[11px] text-muted">optional</span>}
                </span>
                <span className="mt-0.5 block truncate text-[12px] text-muted">
                  {s.done ? s.did : s.todo}
                </span>
              </span>
              {!s.done && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted" />}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
