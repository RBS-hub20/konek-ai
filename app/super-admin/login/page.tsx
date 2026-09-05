'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, Lock } from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Input';

/* useSearchParams needs a boundary, or the page cannot be prerendered. */
export default function SuperAdminLoginPage() {
  return (
    <Suspense fallback={<div className="dark min-h-screen bg-paper" />}>
      <SuperAdminLogin />
    </Suspense>
  );
}

function SuperAdminLogin() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/super-admin/overview';

  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [defaultInUse, setDefaultInUse] = useState(false);

  /* Someone already holding a session should not be asked again. */
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/super-admin/auth', { cache: 'no-store' });
        const body = await res.json();
        setDefaultInUse(Boolean(body.usingDefaultPassword));
        if (body.authenticated) router.replace(next);
      } catch {
        /* The form still works. */
      }
    })();
  }, [router, next]);

  const submit = async () => {
    if (!password) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/super-admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? 'Wrong password');
        setPassword('');
        return;
      }
      router.replace(next);
      router.refresh();
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    /* Dark, like the console it guards. */
    <div className="dark flex min-h-screen items-center justify-center bg-paper px-5">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo size="md" />
        </div>

        <div className="rounded-brand border border-line bg-paper p-7">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-brand border border-line">
              <Lock className="h-3.5 w-3.5 text-ink" />
            </span>
            <div>
              <h1 className="font-display text-[15px] font-semibold text-ink">Super Admin</h1>
              <p className="text-[11px] text-muted">Exclusive access</p>
            </div>
          </div>

          <p className="mt-5 text-[13px] leading-relaxed text-muted">
            This console holds every tenant, your sales numbers and the outbound pipeline.
          </p>

          <div className="mt-6">
            <Field label="Password">
              <Input
                type="password"
                value={password}
                autoFocus
                autoComplete="current-password"
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                placeholder="••••••••••••"
              />
            </Field>
          </div>

          {error && <p className="mt-3 text-[12px] text-red-400">{error}</p>}

          <Button className="mt-6 w-full" onClick={submit} disabled={busy || !password}>
            {busy ? 'Checking…' : 'Unlock Super Admin'}
          </Button>

          {defaultInUse && (
            <div className="mt-5 flex gap-2 rounded-brand border border-amber-500/40 bg-surface p-3">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
              <p className="text-[11px] leading-relaxed text-muted">
                This deployment is still on the documented default password, which is in the repository and
                therefore protects nobody. Set <span className="font-mono text-ink">SUPER_ADMIN_PASSWORD</span> in
                Vercel and redeploy.
              </p>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-[11px] text-muted">RBS Labs · KONEK AI</p>
      </div>
    </div>
  );
}
