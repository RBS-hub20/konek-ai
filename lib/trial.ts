/* ═══════════════════════════════════════════════════════════════════
   The trial, and the words used to sell it.

   One place for both, because the price shows up on the landing page, in
   the welcome screen, in onboarding and on the billing tab, and a $49
   that disagrees with a $49 somewhere else reads as a bug to a buyer.

   The product never says "subscription" to a customer — it says "Keep
   Cindy". The nouns live here so that stays true everywhere.
   ═══════════════════════════════════════════════════════════════════ */

export const TRIAL_DAYS = 3;

export const PRICE = {
  monthly: 49,
  /** Two months free — the yearly price is ten months, not twelve. */
  yearly: 490,
  currency: 'USD',
  symbol: '$',
} as const;

export const PRICE_LINE = `From ${PRICE.symbol}${PRICE.monthly}/mo — less than one staff. ${TRIAL_DAYS}-day free trial.`;

/** What a human costs, for the comparison that does the actual selling. */
export const STAFF_COMPARISON = {
  staff: { label: 'One staff', price: '$400/mo', catch: 'and absent' },
  cindy: { label: 'Cindy', price: `$${PRICE.monthly}/mo`, catch: '24/7, never misses' },
} as const;

export const KEEP_CINDY = {
  heading: 'Keep Cindy',
  trialOffer: `${TRIAL_DAYS}-day free trial, then $${PRICE.monthly}/mo`,
  reassurance: 'Cancel anytime. Live in 5 minutes. No credit card for the trial.',
  cta: 'Start My Free Trial',
  socialProof: 'Join 120+ businesses in PH & AE',
} as const;

/** What the money buys, shown as a checklist next to the price. */
export const INCLUDED = [
  'Your own real phone number',
  'Unlimited answered calls, 24/7',
  'All four vibes, switch any time',
  'Auto language — English, Taglish, Arabic',
  'Transfers to you the moment a caller is hot',
  'Recordings and transcripts of every call',
] as const;

export type TrialState = {
  /** Has a trial ever been started. */
  started: boolean;
  /** Started, and not yet expired. */
  active: boolean;
  expired: boolean;
  daysLeft: number;
  endsAt: string | null;
};

/**
 * Where a business sits in its trial.
 *
 * Days left rounds up, so the last partial day still reads as "1 day left"
 * rather than "0" while the trial is genuinely still running.
 */
export function trialState(b: {
  trial_started_at?: string | null;
  trial_ends_at?: string | null;
} | null | undefined, now = Date.now()): TrialState {
  const idle: TrialState = { started: false, active: false, expired: false, daysLeft: 0, endsAt: null };
  if (!b?.trial_started_at) return idle;

  const endsAt = b.trial_ends_at ?? new Date(new Date(b.trial_started_at).getTime() + TRIAL_DAYS * 864e5).toISOString();
  const ms = new Date(endsAt).getTime() - now;
  if (!Number.isFinite(ms)) return idle;

  return {
    started: true,
    active: ms > 0,
    expired: ms <= 0,
    daysLeft: Math.max(0, Math.ceil(ms / 864e5)),
    endsAt,
  };
}

/** "2 days left", "Last day", "Trial ended" — the banner's own words. */
export function trialLabel(t: TrialState): string {
  if (!t.started) return '';
  if (t.expired) return 'Trial ended';
  if (t.daysLeft <= 1) return 'Last day of your trial';
  return `${t.daysLeft} days left`;
}

/**
 * A paying tenant.
 *
 * Deliberately not derived from `plan`/`status`: every auto-created tenant
 * starts on plan "starter", status "active", so reading those would count
 * everyone as paying. Only a checkout that completed sets this.
 */
export function isSubscribed(b: { subscription_status?: string | null } | null | undefined): boolean {
  return b?.subscription_status === 'active';
}
