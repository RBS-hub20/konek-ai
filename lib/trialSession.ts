/* ═══════════════════════════════════════════════════════════════════
   What we know about someone who has not signed up.

   Try Free Call asks for three things and no account, so the only place
   to keep them between the welcome screen and the setup wizard is this
   browser. It is a convenience, not a credential: nothing here grants
   access to anything, and every field is re-shown for editing in
   onboarding before it is saved.
   ═══════════════════════════════════════════════════════════════════ */

const KEY = 'konek.trial';

export interface TrialSession {
  businessName: string;
  phone: string;
  industry: string;
  country: string;
  callId: string | null;
  at: string;
}

/* Storage throws outright in some embedded contexts, so every access is
   guarded and an empty result is a normal outcome, not an error. */
export function rememberTrial(v: Omit<TrialSession, 'at'>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...v, at: new Date().toISOString() }));
  } catch {
    /* Private window, or storage disabled — onboarding just starts blank. */
  }
}

export function recallTrial(): TrialSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<TrialSession>;
    if (!v?.businessName) return null;
    return {
      businessName: v.businessName,
      phone: v.phone ?? '',
      industry: v.industry ?? '',
      country: v.country ?? '',
      callId: v.callId ?? null,
      at: v.at ?? new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function forgetTrial(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* Nothing to clean up if it was never written. */
  }
}
