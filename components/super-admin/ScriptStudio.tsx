'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, Download, Play, Plus, Star, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Field, Input, Select, Textarea } from '@/components/ui/Input';
import { Switch } from '@/components/ui/Switch';
import { api, tryApi } from '@/lib/apiClient';
import {
  DEFAULT_VOICE_SETTINGS, stepText, SCRIPT_COUNTRIES, SCRIPT_INDUSTRIES, SCRIPT_STEPS,
  SCRIPT_VIBES, renderScript, type OutboundScript, type ScriptStep,
} from '@/lib/types2';
import { cn } from '@/lib/utils';

/* What the preview fills the variables with, so a line reads like a real call. */
const SAMPLE = { company: 'Bubbles Laundry', contact: 'Maria', industry: 'laundry' };

const blankScript = (): Partial<OutboundScript> => ({
  name: '',
  industry: 'laundry',
  vibe: 'professional',
  country: 'PH',
  is_active: true,
  is_default: false,
  voice_settings: { ...DEFAULT_VOICE_SETTINGS },
  script_steps: SCRIPT_STEPS.map((step) => ({ step, text: '', pause_ms: 400 })),
});

export function ScriptStudio() {
  const [scripts, setScripts] = useState<OutboundScript[]>([]);
  const [editing, setEditing] = useState<Partial<OutboundScript> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [filterIndustry, setFilterIndustry] = useState('all');
  const [filterVibe, setFilterVibe] = useState('all');
  const [previewing, setPreviewing] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const seed = async () => {
    setSeeding(true); setNotice(null);
    try {
      const res = await api.seedScripts();
      setNotice(`Loaded ${res.created + res.updated} built-in script${res.created + res.updated === 1 ? '' : 's'}.`);
      await load();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Could not load the built-in scripts');
    } finally {
      setSeeding(false);
    }
  };
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const load = useCallback(async () => {
    const res = await tryApi(() => api.scripts());
    if (res) setScripts(res.scripts);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const shown = scripts.filter(
    (s) => (filterIndustry === 'all' || s.industry === filterIndustry) &&
           (filterVibe === 'all' || s.vibe === filterVibe)
  );

  const save = async (setDefault = false) => {
    if (!editing?.name?.trim()) { setNotice('Give the script a name first.'); return; }
    setSaving(true); setNotice(null);
    try {
      const res = await api.saveScript({ ...editing, setDefault });
      setNotice(`Saved “${res.script.name}”${setDefault ? ' and set as default' : ''}.`);
      setEditing(res.script);
      await load();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  /* Speaks the opener with the script's own voice settings, so the pace being
     chosen is the pace that gets heard. */
  const preview = async () => {
    if (!editing) return;
    const step = editing.script_steps?.find((s) => s.step === 'opener');
    const isPh = editing.country !== 'AE';
    const text = renderScript((isPh ? step?.text_ph : step?.text_ae) || step?.text_ph || '', SAMPLE);
    if (!text) { setNotice('Write an opener first.'); return; }

    setPreviewing(true); setNotice(null);
    try {
      const bridge = await tryApi(() => api.bridgeHealth());
      const base = (bridge?.healthUrl as string | undefined)?.replace('/health', '');
      if (!base) { setNotice('The voice bridge is not reachable, so there is nothing to preview with.'); return; }
      const url = `${base}/voice-sample?` + new URLSearchParams({
        language: isPh ? 'TL' : 'EN',
        text,
        speed: String(editing.voice_settings?.speed ?? 0.92),
      }).toString();
      audioRef.current?.pause();
      const audio = new Audio(url);
      audioRef.current = audio;
      await audio.play();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Could not play the preview');
    } finally {
      setPreviewing(false);
    }
  };

  /* A built-in is the product's, not the operator's: copy it to change it. */
  const locked = editing?.is_builtin === true;

  const setStep = (name: string, patch: Partial<ScriptStep>) => {
    if (!editing) return;
    const steps = (editing.script_steps ?? []).map((s) => (s.step === name ? { ...s, ...patch } : s));
    setEditing({ ...editing, script_steps: steps });
  };

  return (
    <section className="rounded-brand border border-line bg-paper">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-display text-[14px] font-semibold text-ink">Script Studio</h2>
            <Badge tone="accent">New</Badge>
          </div>
          <p className="mt-0.5 text-[12px] text-muted">
            Built-in professional scripts are active. Customising is optional — duplicate one to make it yours.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" className="gap-1.5" disabled={seeding} onClick={() => void seed()}>
            <Download className="h-3.5 w-3.5" /> {seeding ? 'Loading…' : 'Load built-in'}
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => setEditing(blankScript())}>
            <Plus className="h-3.5 w-3.5" /> New script
          </Button>
        </div>
      </div>

      {notice && <p className="border-b border-line px-5 py-3 text-[12px] text-muted">{notice}</p>}

      <div className="grid gap-0 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        {/* Library */}
        <div className="border-b border-line lg:border-b-0 lg:border-r">
          <div className="flex gap-2 border-b border-line px-4 py-3">
            <Select value={filterIndustry} onChange={(e) => setFilterIndustry(e.target.value)} className="h-9">
              <option value="all">All industries</option>
              {SCRIPT_INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
            </Select>
            <Select value={filterVibe} onChange={(e) => setFilterVibe(e.target.value)} className="h-9">
              <option value="all">All vibes</option>
              {SCRIPT_VIBES.map((v) => <option key={v} value={v}>{v}</option>)}
            </Select>
          </div>

          {loading ? (
            <p className="px-5 py-8 text-[13px] text-muted">Loading…</p>
          ) : shown.length === 0 ? (
            <div className="px-5 py-8">
              <p className="text-[13px] text-muted">
                {scripts.length === 0
                  ? 'No scripts yet. Load the built-in professional ones and Cindy is ready to call.'
                  : 'Nothing matches these filters.'}
              </p>
              {scripts.length === 0 && (
                <Button size="sm" className="mt-4 gap-1.5" disabled={seeding} onClick={() => void seed()}>
                  <Download className="h-3.5 w-3.5" /> {seeding ? 'Loading…' : 'Load built-in scripts'}
                </Button>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {shown.map((s) => (
                <li key={s.id}>
                  <div className={cn('px-4 py-3 transition-colors', editing?.id === s.id && 'bg-surface')}>
                    <button type="button" onClick={() => setEditing(s)} className="w-full text-left focus-ring">
                      <div className="flex items-center gap-2">
                        {s.is_default && <Star className="h-3 w-3 shrink-0 fill-accent text-accent" />}
                        <span className="truncate text-[13px] font-medium text-ink">{s.name}</span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {s.is_builtin ? <Badge tone="accent">built-in</Badge> : <Badge>custom</Badge>}
                        <Badge>{s.industry}</Badge>
                        <Badge tone={s.vibe === 'professional' ? 'accent' : 'default'}>{s.vibe}</Badge>
                        <Badge>{s.country}</Badge>
                        {!s.is_active && <Badge tone="warning">off</Badge>}
                      </div>
                    </button>
                    <div className="mt-2 flex items-center gap-1">
                      <button type="button" title="Duplicate"
                        onClick={() => setEditing({ ...s, id: undefined, name: `${s.name} copy`, is_default: false })}
                        className="rounded p-1.5 text-muted hover:text-ink focus-ring">
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" title="Set as default"
                        onClick={async () => { await api.saveScript({ ...s, setDefault: true }); await load(); }}
                        className="rounded p-1.5 text-muted hover:text-ink focus-ring">
                        <Star className="h-3.5 w-3.5" />
                      </button>
                      {!s.is_builtin && (
                        <button type="button" title="Delete"
                          onClick={async () => { if (confirm(`Delete “${s.name}”?`)) { await api.deleteScript(s.id); setEditing(null); await load(); } }}
                          className="rounded p-1.5 text-muted hover:text-red-500 focus-ring">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Editor */}
        <div className="p-5">
          {!editing ? (
            <p className="py-12 text-center text-[13px] text-muted">
              Pick a script to edit, or start a new one.
            </p>
          ) : (
            <div className="space-y-6">
              {locked && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-brand border border-line bg-surface p-3">
                  <span className="text-[12px] text-muted">
                    This is a built-in script. Duplicate it to make changes of your own.
                  </span>
                  <Button size="sm" variant="secondary" className="gap-1.5"
                    onClick={() => setEditing({ ...editing, id: undefined, name: `${editing.name} (custom)`, is_builtin: false, is_default: false })}>
                    <Copy className="h-3.5 w-3.5" /> Duplicate &amp; customise
                  </Button>
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-4">
                <Field label="Name"><Input value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Professional Laundry PH" /></Field>
                <Field label="Industry">
                  <Select value={editing.industry} onChange={(e) => setEditing({ ...editing, industry: e.target.value })}>
                    {SCRIPT_INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
                  </Select>
                </Field>
                <Field label="Vibe">
                  <Select value={editing.vibe} onChange={(e) => setEditing({ ...editing, vibe: e.target.value })}>
                    {SCRIPT_VIBES.map((v) => <option key={v} value={v}>{v}</option>)}
                  </Select>
                </Field>
                <Field label="Country">
                  <Select value={editing.country} onChange={(e) => setEditing({ ...editing, country: e.target.value })}>
                    {SCRIPT_COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </Select>
                </Field>
              </div>

              {/* Voice */}
              <div className="rounded-brand border border-line p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[13px] font-medium text-ink">Voice</span>
                  <Switch
                    checked={editing.is_active !== false}
                    onCheckedChange={(v) => setEditing({ ...editing, is_active: v })}
                    label="Script active"
                  />
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <div className="flex items-baseline justify-between text-[12px]">
                      <span className="text-muted">Speed</span>
                      <span className="tabular-nums text-ink">{editing.voice_settings?.speed ?? 0.92}</span>
                    </div>
                    <input
                      type="range" min="0.8" max="1.2" step="0.01"
                      value={editing.voice_settings?.speed ?? 0.92}
                      onChange={(e) => setEditing({
                        ...editing,
                        voice_settings: { ...DEFAULT_VOICE_SETTINGS, ...editing.voice_settings, speed: Number(e.target.value) },
                      })}
                      className="mt-2 w-full accent-[color:var(--accent)]"
                    />
                    <p className="mt-1 text-[11px] text-muted">Below 1.0 is slower. 0.92 is the clearest on a phone line.</p>
                  </div>
                  <Field label="Emotion">
                    <Select
                      value={editing.voice_settings?.emotion ?? 'professional'}
                      onChange={(e) => setEditing({
                        ...editing,
                        voice_settings: { ...DEFAULT_VOICE_SETTINGS, ...editing.voice_settings, emotion: e.target.value },
                      })}
                    >
                      {['professional', 'friendly', 'warm'].map((x) => <option key={x} value={x}>{x}</option>)}
                    </Select>
                  </Field>
                </div>
              </div>

              {/* Steps */}
              <div className="space-y-4">
                {SCRIPT_STEPS.map((name) => {
                  const step = editing.script_steps?.find((s) => s.step === name)
                    ?? { step: name, text: '', pause_ms: 400 };
                  const preview = renderScript(stepText(step, editing.country), SAMPLE);
                  return (
                    <div key={name} className="rounded-brand border border-line p-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[13px] font-medium capitalize text-ink">{name}</span>
                        <span className="text-[11px] text-muted">{'{{company}} {{contact}} {{industry}}'}</span>
                      </div>
                      <div className="mt-3">
                        <Textarea
                          value={stepText(step, editing.country)}
                          onChange={(e) => setStep(name, { text: e.target.value, text_ph: '', text_ae: '' })}
                          className="min-h-[110px]"
                          placeholder={editing.country === 'PH'
                            ? 'Taglish — spoken from the first word, never announced.'
                            : 'English — clear and unhurried.'}
                          disabled={locked}
                        />
                      </div>
                      {preview && (
                        <p className="mt-3 rounded-brand bg-surface p-3 text-[12px] leading-relaxed text-muted">
                          <span className="text-ink">Preview:</span> “{preview}”
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap gap-2 border-t border-line pt-4">
                <Button size="sm" onClick={() => void save(false)} disabled={saving || locked}>
                  {saving ? 'Saving…' : 'Save script'}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => void save(true)} disabled={saving}>
                  Save &amp; set default
                </Button>
                <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => void preview()} disabled={previewing}>
                  <Play className="h-3.5 w-3.5" /> {previewing ? 'Loading…' : 'Hear the opener'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Close</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
