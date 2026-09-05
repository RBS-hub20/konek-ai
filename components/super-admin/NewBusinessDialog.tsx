'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Input';
import { api } from '@/lib/apiClient';

/* ── New business ────────────────────────────────────────────────── */

export function NewBusinessDialog({ open, onClose, onCreated }: {
  open: boolean; onClose: () => void; onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [plan, setPlan] = useState('starter');
  const [number, setNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true); setError(null);
    try {
      await api.createBusiness({
        name: name.trim(),
        owner_email: email.trim() || null,
        plan,
        outbound_number: number.trim() || null,
      });
      setName(''); setEmail(''); setNumber(''); setPlan('starter');
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the business');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="newbiz" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-brand border border-line bg-paper p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <h3 className="font-display text-[16px] font-semibold text-ink">New business</h3>
              <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-muted hover:text-ink focus-ring">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-6 space-y-4">
              <Field label="Business name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Marina Heights Realty" autoFocus /></Field>
              <Field label="Owner email"><Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="owner@example.com" /></Field>
              <Field label="Plan">
                <Select value={plan} onChange={(e) => setPlan(e.target.value)}>
                  <option value="starter">Starter · 500 calls</option>
                  <option value="pro">Pro · 2,000 calls</option>
                  <option value="enterprise">Enterprise · 20,000 calls</option>
                </Select>
              </Field>
              <Field label="Outbound number" hint="Assign one from the Number Pool, or leave blank for now.">
                <Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="+12232263852" />
              </Field>
            </div>

            {error && <p className="mt-4 text-[12px] text-red-500">{error}</p>}

            <div className="mt-6 flex gap-2">
              <Button size="sm" onClick={create} disabled={busy || !name.trim()}>{busy ? 'Creating…' : 'Create business'}</Button>
              <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
