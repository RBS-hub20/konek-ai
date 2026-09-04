'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { KeyRound, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Input';
import { useKonekStore } from '@/lib/store';

/**
 * Placing a live call needs KONEK_API_SECRET, which must never live in client
 * code. The operator types it once here; it is verified server-side and
 * exchanged for a short-lived httpOnly cookie. Nothing is stored in the browser.
 */
export function UnlockDialog({
  open,
  onClose,
  onUnlocked,
}: {
  open: boolean;
  onClose: () => void;
  onUnlocked?: () => void;
}) {
  const unlock = useKonekStore((s) => s.unlock);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!key.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await unlock(key.trim());
      setKey('');
      onUnlocked?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not unlock');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="unlock-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-4 sm:items-center"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-brand border border-line bg-paper p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-brand border border-line">
                  <KeyRound className="h-4 w-4 text-ink" />
                </span>
                <div>
                  <h3 className="font-display text-[15px] font-semibold text-ink">Unlock live calling</h3>
                  <p className="mt-0.5 text-[11px] text-muted">Required once per session</p>
                </div>
              </div>
              <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-muted hover:text-ink focus-ring">
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-5 text-[13px] leading-relaxed text-muted">
              Real calls cost money, so they are gated by your <code className="text-ink">KONEK_API_SECRET</code>.
              Enter it once — it is verified on the server and never stored in your browser.
            </p>

            <div className="mt-5">
              <Field label="KONEK_API_SECRET">
                <Input
                  type="password"
                  value={key}
                  autoFocus
                  onChange={(e) => setKey(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submit()}
                  placeholder="Paste your secret"
                />
              </Field>
            </div>

            {error && <p className="mt-3 text-[12px] text-red-500">{error}</p>}

            <div className="mt-6 flex gap-2">
              <Button size="sm" onClick={submit} disabled={busy || !key.trim()}>
                {busy ? 'Verifying…' : 'Unlock'}
              </Button>
              <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
