'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowUp, Calendar, Clock, DollarSign, Heart, MessageCircle, Sparkles,
  Star, Target, Trash2, TrendingUp, X, type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Switch } from '@/components/ui/Switch';
import { Field, Input, Select, Textarea } from '@/components/ui/Input';
import { VIBE_CONFIG } from '@/lib/ai/vibes';
import { VIBE_KEYS, type SkillRecord, type VibeKey } from '@/lib/types2';
import { useKonekStore } from '@/lib/store';
import { cn } from '@/lib/utils';

/* Icons stay client-side and are matched to the seeded skill ids. */
const ICONS: Record<string, LucideIcon> = {
  closer: Target, followup: Clock, upsell: TrendingUp, booking: Calendar,
  faq: MessageCircle, collection: DollarSign, winback: Heart, review: Star,
};
const iconFor = (id: string) => ICONS[id] ?? ArrowUp;

const CATEGORIES = ['SALES', 'SUPPORT', 'MARKETING'];
const TRIGGERS = ['When customer says...', 'Always do...', 'After call...'];

export function SkillsLibraryTab() {
  const { skills, loadSkills, toggleSkill, addSkill, removeSkill } = useKonekStore();
  const [preview, setPreview] = useState<SkillRecord | null>(null);

  const [describe, setDescribe] = useState('');
  const [name, setName] = useState('');
  const [trigger, setTrigger] = useState(TRIGGERS[0]);
  const [vibe, setVibe] = useState<VibeKey>('PRO_CLOSER');
  const [category, setCategory] = useState('SALES');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { void loadSkills(); }, [loadSkills]);

  const readyMade = skills.filter((s) => s.business_id === null);
  const custom = skills.filter((s) => s.business_id !== null);
  const canCreate = describe.trim().length > 8 && name.trim().length > 0;

  const create = async () => {
    if (!canCreate) return;
    setSaving(true); setError(null);
    try {
      await addSkill({
        name: name.trim(),
        description: describe.trim(),
        category,
        vibe,
        script: `TRIGGER TYPE: ${trigger}\nRULE: ${describe.trim()}\n\nRespond in the ${VIBE_CONFIG[vibe].label} vibe, stay strictly inside the Business Brain, and return to the call goal immediately afterwards.`,
      });
      setDescribe(''); setName(''); setTrigger(TRIGGERS[0]); setVibe('PRO_CLOSER');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the skill');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-12">
      <div>
        <h1 className="font-display text-[22px] font-semibold tracking-tight text-ink">
          Skills Library — Select what KONEK can do
        </h1>
        <p className="mt-1.5 text-[13px] text-muted">
          Ready-made expert skills. One click to activate. Or create your own.
        </p>
      </div>

      {/* Ready-made */}
      <section>
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="eyebrow">Ready-Made Skills</h2>
          <span className="text-[12px] text-muted">
            {skills.filter((s) => s.is_active).length} of {skills.length} active
          </span>
        </div>

        <div className="mt-6 space-y-8">
          {CATEGORIES.map((cat) => {
            const group = readyMade.filter((s) => (s.category ?? '').toUpperCase() === cat);
            if (!group.length) return null;
            return (
              <div key={cat}>
                <div className="mb-4 flex items-center gap-3">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-ink">{cat}</span>
                  <span className="h-px flex-1 bg-line" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {group.map((s) => {
                    const Icon = iconFor(s.id);
                    return (
                      <div key={s.id} className={cn('flex flex-col rounded-brand border bg-paper p-5 transition-colors', s.is_active ? 'border-ink' : 'border-line')}>
                        <div className="flex items-start justify-between gap-3">
                          <span className={cn('flex h-9 w-9 items-center justify-center rounded-brand border', s.is_active ? 'border-ink bg-ink text-paper' : 'border-line text-ink')}>
                            <Icon className="h-4 w-4" />
                          </span>
                          <Switch checked={s.is_active} onCheckedChange={() => void toggleSkill(s.id)} label={`Toggle ${s.name}`} />
                        </div>
                        <h3 className="mt-4 font-display text-[14px] font-semibold text-ink">{s.name}</h3>
                        <p className="mt-2 flex-1 text-[12.5px] leading-relaxed text-muted">{s.description}</p>
                        <div className="mt-5 flex items-center justify-between gap-3 border-t border-line pt-4">
                          <Badge>{s.category}</Badge>
                          <button type="button" onClick={() => setPreview(s)} className="rounded text-[12px] font-medium text-muted transition-colors hover:text-ink focus-ring">
                            Preview Script
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Custom builder */}
      <section id="custom-skill-builder">
        <h2 className="eyebrow">Custom Skill Builder</h2>

        <div className="mt-6 rounded-brand border border-line bg-paper p-6 md:p-7">
          <div className="flex items-center gap-2.5">
            <Sparkles className="h-4 w-4 text-ink" />
            <h3 className="font-display text-[15px] font-semibold text-ink">Create Custom Skill</h3>
          </div>

          <div className="mt-6">
            <Textarea
              value={describe}
              onChange={(e) => setDescribe(e.target.value)}
              placeholder="Describe in plain English what you want KONEK to do... e.g., 'When customer says it's expensive, say we have installment and free delivery in Dubai'"
              className="min-h-[132px]"
            />
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-4">
            <Field label="Skill Name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Dubai Delivery Objection" /></Field>
            <Field label="When to Trigger">
              <Select value={trigger} onChange={(e) => setTrigger(e.target.value)}>
                {TRIGGERS.map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
            </Field>
            <Field label="Category">
              <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </Field>
            <Field label="Vibe">
              <Select value={vibe} onChange={(e) => setVibe(e.target.value as VibeKey)}>
                {VIBE_KEYS.map((v) => <option key={v} value={v}>{VIBE_CONFIG[v].label}</option>)}
              </Select>
            </Field>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button onClick={create} disabled={!canCreate || saving} className="gap-2">
              <Sparkles className="h-3.5 w-3.5" />
              {saving ? 'Creating…' : 'Create Custom Skill with AI'}
            </Button>
            {!canCreate && <span className="text-[12px] text-muted">Add a name and a description to create.</span>}
            {error && <span className="text-[12px] text-red-500">{error}</span>}
          </div>
        </div>

        <div className="mt-8">
          <h3 className="font-display text-[14px] font-semibold text-ink">Your Custom Skills</h3>
          {custom.length === 0 ? (
            <p className="mt-3 text-[13px] text-muted">No custom skills yet. Describe one above and KONEK will compile it.</p>
          ) : (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {custom.map((c) => (
                <div key={c.id} className="rounded-brand border border-line bg-paper p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className="font-display text-[14px] font-semibold text-ink">{c.name}</h4>
                      <p className="mt-0.5 text-[11px] text-muted">{c.category}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Switch checked={c.is_active} onCheckedChange={() => void toggleSkill(c.id)} label={`Toggle ${c.name}`} />
                      <button
                        type="button" onClick={() => void removeSkill(c.id)} aria-label={`Delete ${c.name}`}
                        className="rounded p-1.5 text-muted transition-colors hover:text-red-500 focus-ring"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="mt-3 text-[12.5px] leading-relaxed text-muted">{c.description}</p>
                  <div className="mt-4 flex flex-wrap gap-1.5 border-t border-line pt-4">
                    {c.vibe && <Badge tone="accent">{VIBE_CONFIG[c.vibe as VibeKey]?.label ?? c.vibe}</Badge>}
                    <button type="button" onClick={() => setPreview(c)} className="rounded text-[11px] font-medium text-muted hover:text-ink focus-ring">
                      Preview Script
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Script preview */}
      <AnimatePresence>
        {preview && (
          <motion.div
            key="script-preview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
            onClick={() => setPreview(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg rounded-brand border border-line bg-paper p-6"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-brand border border-line">
                    {(() => { const I = iconFor(preview.id); return <I className="h-4 w-4 text-ink" />; })()}
                  </span>
                  <div>
                    <h3 className="font-display text-[15px] font-semibold text-ink">{preview.name}</h3>
                    <p className="mt-0.5 text-[11px] text-muted">{preview.category}</p>
                  </div>
                </div>
                <button type="button" onClick={() => setPreview(null)} aria-label="Close" className="rounded p-1 text-muted hover:text-ink focus-ring">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <pre className="mt-6 max-h-[50vh] overflow-y-auto whitespace-pre-wrap rounded-brand bg-surface p-5 font-sans text-[12.5px] leading-relaxed text-ink">
                {preview.script || preview.system_prompt}
              </pre>

              <div className="mt-6 flex items-center justify-between gap-3">
                <span className="text-[12px] text-muted">{preview.is_active ? 'Active on your calls' : 'Not active yet'}</span>
                <Button size="sm" variant={preview.is_active ? 'secondary' : 'primary'} onClick={() => void toggleSkill(preview.id)}>
                  {preview.is_active ? 'Turn off' : 'Turn on'}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
