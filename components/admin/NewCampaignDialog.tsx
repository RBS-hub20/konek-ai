'use client';

import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, Trash2, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Field, Input } from '@/components/ui/Input';
import { VIBE_CONFIG } from '@/lib/ai/vibes';
import { VIBE_KEYS, type VibeKey } from '@/lib/types2';
import { api } from '@/lib/apiClient';
import { useKonekStore } from '@/lib/store';
import { cn } from '@/lib/utils';

interface Row { name: string; phone: string }

/** Parses a CSV with a name and phone column, header optional. */
function parseCsv(text: string): Row[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];

  const split = (l: string) => l.split(/[,;\t]/).map((c) => c.trim().replace(/^"|"$/g, ''));
  const first = split(lines[0]).map((c) => c.toLowerCase());
  const hasHeader = first.some((c) => ['name', 'phone', 'number', 'mobile', 'contact'].includes(c));

  let nameIdx = 0;
  let phoneIdx = 1;
  if (hasHeader) {
    const ni = first.findIndex((c) => c.includes('name'));
    const pi = first.findIndex((c) => c.includes('phone') || c.includes('number') || c.includes('mobile'));
    if (ni >= 0) nameIdx = ni;
    if (pi >= 0) phoneIdx = pi;
  }

  return lines
    .slice(hasHeader ? 1 : 0)
    .map((l) => {
      const cells = split(l);
      /* A single-column file is a list of numbers. */
      if (cells.length === 1) return { name: '', phone: cells[0] };
      return { name: cells[nameIdx] ?? '', phone: cells[phoneIdx] ?? '' };
    })
    .filter((r) => /[0-9]{6,}/.test(r.phone));
}

export function NewCampaignDialog({ open, onClose, onCreated }: {
  open: boolean; onClose: () => void; onCreated: () => void;
}) {
  const { businessId, skills } = useKonekStore();
  const [name, setName] = useState('');
  const [vibe, setVibe] = useState<VibeKey>('PRO_CLOSER');
  const [picked, setPicked] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [manual, setManual] = useState<Row>({ name: '', phone: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setName(''); setVibe('PRO_CLOSER'); setPicked([]); setRows([]);
    setManual({ name: '', phone: '' }); setError(null);
  };

  const onFile = async (file: File | null | undefined) => {
    if (!file) return;
    try {
      const parsed = parseCsv(await file.text());
      if (!parsed.length) {
        setError('No phone numbers found in that file. Expected columns: name, phone.');
        return;
      }
      setRows((r) => [...r, ...parsed]);
      setError(null);
    } catch {
      setError('Could not read that file.');
    }
  };

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true); setError(null);
    try {
      await api.createCampaign({
        name: name.trim(), vibe, skills: picked,
        contacts: rows.map((r) => ({ name: r.name || undefined, phone: r.phone })),
        businessId: businessId ?? undefined,
      });
      reset();
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create campaign');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="newcampaign-backdrop"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-brand border border-line bg-paper p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-display text-[16px] font-semibold text-ink">New Campaign</h3>
                <p className="mt-0.5 text-[12px] text-muted">Name it, pick a vibe and skills, then add your audience.</p>
              </div>
              <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-muted hover:text-ink focus-ring">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-6 space-y-6">
              <Field label="Campaign name">
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="December Package Push" autoFocus />
              </Field>

              <div>
                <span className="text-[12px] font-medium text-ink">Vibe</span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {VIBE_KEYS.map((v) => (
                    <button
                      key={v} type="button" onClick={() => setVibe(v)}
                      className={cn(
                        'h-9 rounded-brand border px-4 text-[11px] font-semibold uppercase tracking-wide transition-colors focus-ring',
                        v === vibe ? 'border-ink bg-ink text-paper' : 'border-line bg-paper text-muted hover:bg-surface hover:text-ink'
                      )}
                    >
                      {VIBE_CONFIG[v].label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="text-[12px] font-medium text-ink">Skills</span>
                <p className="mt-1 text-[11px] text-muted">Leave empty to use whatever is switched on in Skills Library.</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {skills.map((s) => {
                    const on = picked.includes(s.id);
                    return (
                      <button
                        key={s.id} type="button"
                        onClick={() => setPicked((p) => (on ? p.filter((x) => x !== s.id) : [...p, s.id]))}
                        className={cn(
                          'h-8 rounded-brand border px-3 text-[12px] transition-colors focus-ring',
                          on ? 'border-ink bg-ink text-paper' : 'border-line bg-paper text-muted hover:bg-surface hover:text-ink'
                        )}
                      >
                        {s.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Audience */}
              <div className="border-t border-line pt-6">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[12px] font-medium text-ink">Audience</span>
                  <span className="text-[12px] tabular-nums text-muted">{rows.length} contact{rows.length === 1 ? '' : 's'}</span>
                </div>

                <div
                  onClick={() => fileRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); void onFile(e.dataTransfer.files?.[0]); }}
                  className="mt-3 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-brand border border-dashed border-line px-4 py-7 text-center transition-colors hover:bg-surface"
                >
                  <Upload className="h-4 w-4 text-muted" />
                  <div className="text-[13px] font-medium text-ink">Upload CSV</div>
                  <div className="text-[11px] text-muted">Columns: name, phone — header optional</div>
                  <input
                    ref={fileRef} type="file" accept=".csv,text/csv,text/plain" hidden
                    onChange={(e) => void onFile(e.target.files?.[0])}
                  />
                </div>

                <div className="mt-3 flex gap-2">
                  <Input
                    value={manual.name} onChange={(e) => setManual({ ...manual, name: e.target.value })}
                    placeholder="Name" className="flex-1"
                  />
                  <Input
                    value={manual.phone} onChange={(e) => setManual({ ...manual, phone: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && manual.phone.trim()) {
                        setRows((r) => [...r, manual]); setManual({ name: '', phone: '' });
                      }
                    }}
                    placeholder="+639171234567" className="flex-1"
                  />
                  <Button
                    variant="secondary" size="md" className="shrink-0 px-3"
                    onClick={() => { if (manual.phone.trim()) { setRows((r) => [...r, manual]); setManual({ name: '', phone: '' }); } }}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>

                {rows.length > 0 && (
                  <div className="mt-4 max-h-44 overflow-y-auto rounded-brand border border-line">
                    {rows.map((r, i) => (
                      <div key={i} className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5 last:border-0">
                        <div className="min-w-0">
                          <div className="truncate text-[13px] text-ink">{r.name || 'Unnamed'}</div>
                          <div className="text-[11px] tabular-nums text-muted">{r.phone}</div>
                        </div>
                        <button
                          type="button" aria-label={`Remove ${r.phone}`}
                          onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                          className="rounded p-1 text-muted transition-colors hover:text-red-500 focus-ring"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {error && <p className="mt-4 text-[12px] text-red-500">{error}</p>}

            <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-line pt-5">
              <Button size="sm" onClick={create} disabled={busy || !name.trim()}>
                {busy ? 'Creating…' : 'Create campaign'}
              </Button>
              <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
              {rows.length > 0 && <Badge tone="accent">{rows.length} in audience</Badge>}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
