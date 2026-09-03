'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Pencil, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Switch } from '@/components/ui/Switch';
import { Field, Input, Select, Textarea } from '@/components/ui/Input';
import {
  READY_MADE_SKILLS,
  SKILL_CATEGORIES,
  TRIGGER_OPTIONS,
  VIBES,
  type Skill,
  type Vibe,
} from '@/lib/mockData';
import { useKonekStore, type CustomSkill } from '@/lib/store';
import { cn } from '@/lib/utils';

export function SkillsLibraryTab() {
  const { activeSkills, toggleSkill, customSkills, addCustomSkill, updateCustomSkill, removeCustomSkill } =
    useKonekStore();
  const [preview, setPreview] = useState<Skill | null>(null);

  /* Custom Skill Builder form */
  const [describe, setDescribe] = useState('');
  const [name, setName] = useState('');
  const [trigger, setTrigger] = useState<string>(TRIGGER_OPTIONS[0]);
  const [vibe, setVibe] = useState<Vibe>('PRO CLOSER');
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<Omit<CustomSkill, 'id' | 'createdAt'> | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const canGenerate = describe.trim().length > 8 && name.trim().length > 0;

  /* Keep a handle on the in-flight compile so a save or unmount cancels it —
     otherwise a late timer resurrects the preview after it has been dismissed. */
  const compileTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelCompile = () => {
    if (compileTimer.current) clearTimeout(compileTimer.current);
    compileTimer.current = null;
    setGenerating(false);
  };
  useEffect(() => cancelCompile, []);

  const handleGenerate = () => {
    if (!canGenerate) return;
    cancelCompile();
    setGenerating(true);
    /* Stand-in for the skill-compilation call */
    compileTimer.current = setTimeout(() => {
      compileTimer.current = null;
      setGenerated({ name: name.trim(), description: describe.trim(), trigger, vibe });
      setGenerating(false);
    }, 700);
  };

  const handleSave = () => {
    if (!generated) return;
    cancelCompile();
    if (editingId) {
      updateCustomSkill(editingId, generated);
      setEditingId(null);
    } else {
      addCustomSkill(generated);
    }
    setGenerated(null);
    setDescribe('');
    setName('');
    setTrigger(TRIGGER_OPTIONS[0]);
    setVibe('PRO CLOSER');
  };

  const startEdit = (c: CustomSkill) => {
    cancelCompile();
    setEditingId(c.id);
    setName(c.name);
    setDescribe(c.description);
    setTrigger(c.trigger);
    setVibe(c.vibe);
    setGenerated(null);
    document.getElementById('custom-skill-builder')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="space-y-12">
      {/* ── Header ───────────────────────────────────────────── */}
      <div>
        <h1 className="font-display text-[22px] font-semibold tracking-tight text-ink">
          Skills Library — Select what KONEK can do
        </h1>
        <p className="mt-1.5 text-[13px] text-muted">
          Ready-made expert skills. One click to activate. Or create your own.
        </p>
      </div>

      {/* ── Section A · Ready-made skills ────────────────────── */}
      <section>
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="eyebrow">Ready-Made Skills</h2>
          <span className="text-[12px] text-muted">
            {activeSkills.length} of {READY_MADE_SKILLS.length} active
          </span>
        </div>

        <div className="mt-6 space-y-8">
          {SKILL_CATEGORIES.map((cat) => (
            <div key={cat}>
              <div className="mb-4 flex items-center gap-3">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-ink">{cat}</span>
                <span className="h-px flex-1 bg-line" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {READY_MADE_SKILLS.filter((s) => s.category === cat).map((s) => {
                  const on = activeSkills.includes(s.id);
                  return (
                    <div
                      key={s.id}
                      className={cn(
                        'flex flex-col rounded-brand border bg-paper p-5 transition-colors',
                        on ? 'border-ink' : 'border-line'
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span
                          className={cn(
                            'flex h-9 w-9 items-center justify-center rounded-brand border',
                            on ? 'border-ink bg-ink text-paper' : 'border-line text-ink'
                          )}
                        >
                          <s.icon className="h-4 w-4" />
                        </span>
                        <Switch checked={on} onCheckedChange={() => toggleSkill(s.id)} label={`Toggle ${s.name}`} />
                      </div>

                      <h3 className="mt-4 font-display text-[14px] font-semibold text-ink">{s.name}</h3>
                      <p className="mt-2 flex-1 text-[12.5px] leading-relaxed text-muted">{s.description}</p>

                      <div className="mt-5 flex items-center justify-between gap-3 border-t border-line pt-4">
                        <Badge>{s.category}</Badge>
                        <button
                          type="button"
                          onClick={() => setPreview(s)}
                          className="text-[12px] font-medium text-muted transition-colors hover:text-ink focus-ring rounded"
                        >
                          Preview Script
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Section B · Custom Skill Builder ─────────────────── */}
      <section id="custom-skill-builder">
        <h2 className="eyebrow">Custom Skill Builder</h2>

        <div className="mt-6 rounded-brand border border-line bg-paper p-6 md:p-7">
          <div className="flex items-center gap-2.5">
            <Plus className="h-4 w-4 text-ink" />
            <h3 className="font-display text-[15px] font-semibold text-ink">
              {editingId ? 'Edit Custom Skill' : 'Create Custom Skill'}
            </h3>
          </div>

          <div className="mt-6">
            <Textarea
              value={describe}
              onChange={(e) => setDescribe(e.target.value)}
              placeholder="Describe in plain English what you want KONEK to do... e.g., 'When customer says it's expensive, say we have installment and free delivery in Dubai'"
              className="min-h-[132px]"
            />
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <Field label="Skill Name">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Dubai Delivery Objection"
              />
            </Field>
            <Field label="When to Trigger">
              <Select value={trigger} onChange={(e) => setTrigger(e.target.value)}>
                {TRIGGER_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Vibe">
              <Select value={vibe} onChange={(e) => setVibe(e.target.value as Vibe)}>
                {VIBES.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button onClick={handleGenerate} disabled={!canGenerate || generating} className="gap-2">
              <Sparkles className="h-3.5 w-3.5" />
              {generating ? 'Compiling…' : 'Create Custom Skill with AI'}
            </Button>
            {editingId && (
              <Button
                variant="ghost"
                onClick={() => {
                  cancelCompile();
                  setEditingId(null);
                  setGenerated(null);
                  setName('');
                  setDescribe('');
                }}
              >
                Cancel
              </Button>
            )}
            {!canGenerate && (
              <span className="text-[12px] text-muted">Add a name and a description to generate.</span>
            )}
          </div>

          {/* Generated preview */}
          <AnimatePresence>
            {generated && (
              <motion.div
                key="generated-preview"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                className="mt-6 rounded-brand border border-accent bg-accent/[0.05] p-5"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-accent">
                    Generated skill preview
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      cancelCompile();
                      setGenerated(null);
                    }}
                    aria-label="Dismiss preview"
                    className="text-muted transition-colors hover:text-ink focus-ring rounded"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                <h4 className="mt-3 font-display text-[15px] font-semibold text-ink">{generated.name}</h4>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge tone="accent">{generated.trigger}</Badge>
                  <Badge>{generated.vibe}</Badge>
                </div>
                <pre className="mt-4 whitespace-pre-wrap font-sans text-[12.5px] leading-relaxed text-ink">
                  {`TRIGGER · ${generated.trigger.replace('...', '')} ${generated.description}\n\nKONEK responds in the ${generated.vibe} vibe, stays inside your Business Brain, and returns to the call goal immediately after.`}
                </pre>

                <div className="mt-5 flex gap-2">
                  <Button size="sm" onClick={handleSave} className="gap-1.5">
                    <Check className="h-3.5 w-3.5" /> {editingId ? 'Save changes' : 'Add to my skills'}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={handleGenerate}>
                    Regenerate
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Your custom skills ─────────────────────────────── */}
        <div className="mt-8">
          <h3 className="font-display text-[14px] font-semibold text-ink">Your Custom Skills</h3>
          {customSkills.length === 0 ? (
            <p className="mt-3 text-[13px] text-muted">
              No custom skills yet. Describe one above and KONEK will compile it.
            </p>
          ) : (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {customSkills.map((c) => (
                <div key={c.id} className="rounded-brand border border-line bg-paper p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className="font-display text-[14px] font-semibold text-ink">{c.name}</h4>
                      <p className="mt-0.5 text-[11px] text-muted">{c.createdAt}</p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => startEdit(c)}
                        aria-label={`Edit ${c.name}`}
                        className="rounded p-1.5 text-muted transition-colors hover:text-ink focus-ring"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeCustomSkill(c.id)}
                        aria-label={`Delete ${c.name}`}
                        className="rounded p-1.5 text-muted transition-colors hover:text-red-500 focus-ring"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="mt-3 text-[12.5px] leading-relaxed text-muted">{c.description}</p>
                  <div className="mt-4 flex flex-wrap gap-1.5 border-t border-line pt-4">
                    <Badge tone="accent">{c.trigger}</Badge>
                    <Badge>{c.vibe}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Script preview modal ─────────────────────────────── */}
      <AnimatePresence>
        {preview && (
          <motion.div
            key="script-preview"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
            onClick={() => setPreview(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg rounded-brand border border-line bg-paper p-6"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-brand border border-line">
                    <preview.icon className="h-4 w-4 text-ink" />
                  </span>
                  <div>
                    <h3 className="font-display text-[15px] font-semibold text-ink">{preview.name}</h3>
                    <p className="mt-0.5 text-[11px] text-muted">{preview.category}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPreview(null)}
                  aria-label="Close"
                  className="rounded p-1 text-muted transition-colors hover:text-ink focus-ring"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <pre className="mt-6 max-h-[50vh] overflow-y-auto whitespace-pre-wrap rounded-brand bg-surface p-5 font-sans text-[12.5px] leading-relaxed text-ink">
                {preview.script}
              </pre>

              <div className="mt-6 flex items-center justify-between gap-3">
                <span className="text-[12px] text-muted">
                  {activeSkills.includes(preview.id) ? 'Active on your calls' : 'Not active yet'}
                </span>
                <Button
                  size="sm"
                  variant={activeSkills.includes(preview.id) ? 'secondary' : 'primary'}
                  onClick={() => toggleSkill(preview.id)}
                >
                  {activeSkills.includes(preview.id) ? 'Turn off' : 'Turn on'}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
