'use client';

import { useRef, useState } from 'react';
import { api } from '@/lib/apiClient';
import { CalendarCheck, FileText, Handshake, Link2, MessageSquareText, Upload, X } from 'lucide-react';
import { Field, Input, Textarea } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useKonekStore, type Goal } from '@/lib/store';
import { cn } from '@/lib/utils';

const GOALS: { id: Goal; title: string; body: string; icon: typeof Handshake }[] = [
  { id: 'Explain', title: 'Explain', body: 'Answer questions and educate the customer. No pushing.', icon: MessageSquareText },
  { id: 'Book', title: 'Book', body: 'Get the appointment on the calendar before hanging up.', icon: CalendarCheck },
  { id: 'Close', title: 'Close', body: 'Handle objections and land the sale on the call.', icon: Handshake },
];

export function BusinessBrainTab() {
  const { profile, setProfile, knowledge, addKnowledge, removeKnowledge, goal, setGoal, businessId } =
    useKonekStore();
  const [dragging, setDragging] = useState(false);
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  /* Uploads go to /api/brain/upload, which chunks and embeds the text. */
  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setNotice(null);
    for (const f of Array.from(files)) {
      addKnowledge(f.name); // optimistic chip
      setBusy(f.name);
      try {
        const res = await api.uploadFile(f, businessId ?? undefined);
        setNotice(
          res.warning
            ? `${res.source}: ${res.warning}`
            : `${res.source} indexed — ${res.chunks} chunk${res.chunks === 1 ? '' : 's'}${
                res.embedded ? `, ${res.embedded} embedded` : ''
              }.`
        );
      } catch (err) {
        removeKnowledge(f.name);
        setNotice(`Could not upload ${f.name}: ${err instanceof Error ? err.message : 'unknown error'}`);
      } finally {
        setBusy(null);
      }
    }
  };

  return (
    <div className="space-y-7">
      <div>
        <h1 className="font-display text-[22px] font-semibold tracking-tight text-ink">Business Brain</h1>
        <p className="mt-1.5 text-[13px] text-muted">
          Everything KONEK knows about you. It never answers from anything else.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* ── Business Profile ─────────────────────────────────── */}
        <section className="rounded-brand border border-line bg-paper p-6">
          <h2 className="font-display text-[14px] font-semibold text-ink">Business Profile</h2>
          <p className="mt-1 text-[12px] text-muted">Who you are and what you sell.</p>
          <div className="mt-6 space-y-5">
            <Field label="Business name">
              <Input
                value={profile.name}
                onChange={(e) => setProfile({ name: e.target.value })}
                placeholder="Nova Aesthetics"
              />
            </Field>
            <Field label="What you sell">
              <Textarea
                value={profile.sells}
                onChange={(e) => setProfile({ sells: e.target.value })}
                placeholder="Skin treatments, facials and aftercare packages"
                className="min-h-[96px]"
              />
            </Field>
            <Field label="Price range" hint="KONEK quotes inside this range only.">
              <Input
                value={profile.price}
                onChange={(e) => setProfile({ price: e.target.value })}
                placeholder="₱2,500 – ₱12,800"
              />
            </Field>
          </div>
        </section>

        {/* ── Knowledge Uploader ───────────────────────────────── */}
        <section className="rounded-brand border border-line bg-paper p-6">
          <h2 className="font-display text-[14px] font-semibold text-ink">Knowledge Uploader</h2>
          <p className="mt-1 text-[12px] text-muted">PDFs, menus, price lists or a website link.</p>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void handleFiles(e.dataTransfer.files);
            }}
            onClick={() => fileRef.current?.click()}
            className={cn(
              'mt-6 flex cursor-pointer flex-col items-center justify-center gap-2.5 rounded-brand border border-dashed px-4 py-9 text-center transition-colors',
              dragging ? 'border-accent bg-accent/[0.05]' : 'border-line hover:bg-surface'
            )}
          >
            <Upload className={cn('h-5 w-5', dragging ? 'text-accent' : 'text-muted')} />
            <div className="text-[13px] font-medium text-ink">Drag &amp; drop files</div>
            <div className="text-[11px] text-muted">PDF, DOCX, CSV or images · max 20MB</div>
            <input
              ref={fileRef}
              type="file"
              multiple
              hidden
              onChange={(e) => void handleFiles(e.target.files)}
            />
          </div>

          <form
            className="mt-4 flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const v = link.trim();
              if (!v) return;
              const label = v.replace(/^https?:\/\//, '').replace(/\/$/, '');
              addKnowledge(label);
              setLink('');
              setBusy(label);
              setNotice(null);
              try {
                const res = await api.uploadUrl(v, businessId ?? undefined);
                setNotice(`${res.source} read — ${res.chunks} chunk${res.chunks === 1 ? '' : 's'} indexed.`);
              } catch (err) {
                removeKnowledge(label);
                setNotice(`Could not read ${label}: ${err instanceof Error ? err.message : 'unknown error'}`);
              } finally {
                setBusy(null);
              }
            }}
          >
            <Input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="Paste a website link"
              className="flex-1"
            />
            <Button type="submit" variant="secondary" size="md" className="shrink-0 px-3">
              <Link2 className="h-4 w-4" />
            </Button>
          </form>

          {(busy || notice) && (
            <p className="mt-4 text-[11px] leading-relaxed text-muted">
              {busy ? `Indexing ${busy}…` : notice}
            </p>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            {knowledge.length === 0 && (
              <span className="text-[12px] text-muted">Nothing uploaded yet.</span>
            )}
            {knowledge.map((k) => (
              <span
                key={k}
                className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-[12px] text-ink"
              >
                <FileText className="h-3 w-3 text-muted" />
                <span className="max-w-[160px] truncate">{k}</span>
                <button
                  type="button"
                  onClick={() => removeKnowledge(k)}
                  aria-label={`Remove ${k}`}
                  className="text-muted transition-colors hover:text-ink focus-ring rounded-full"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        </section>

        {/* ── Goal Selector ────────────────────────────────────── */}
        <section className="rounded-brand border border-line bg-paper p-6">
          <h2 className="font-display text-[14px] font-semibold text-ink">Goal Selector</h2>
          <p className="mt-1 text-[12px] text-muted">What every call should be driving toward.</p>
          <div className="mt-6 space-y-3">
            {GOALS.map((g) => {
              const active = goal === g.id;
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setGoal(g.id)}
                  aria-pressed={active}
                  className={cn(
                    'flex w-full items-start gap-3.5 rounded-brand border p-4 text-left transition-colors focus-ring',
                    active ? 'border-ink bg-surface' : 'border-line hover:bg-surface'
                  )}
                >
                  <span
                    className={cn(
                      'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                      active ? 'border-ink' : 'border-line'
                    )}
                  >
                    {active && <span className="h-2 w-2 rounded-full bg-ink" />}
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 text-[13px] font-medium text-ink">
                      <g.icon className="h-3.5 w-3.5 text-muted" />
                      {g.title}
                    </span>
                    <span className="mt-1 block text-[12px] leading-relaxed text-muted">{g.body}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
