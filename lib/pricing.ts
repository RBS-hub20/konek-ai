/* ═══════════════════════════════════════════════════════════════════
   What a plan is, in minutes.

   A call is not a unit of cost. Twilio, the model and the voice all bill
   by the minute, so pricing by the call charges the same for a ninety
   second enquiry and a nine minute conversation, and loses money on the
   second one.

   ── The arithmetic, so it is checkable rather than assumed ──────────
   At COST_PER_MINUTE, a plan only makes money below a break-even
   utilisation of its own allowance:

     Starter   $49  ÷ 300 min  = $0.163/min   break-even at 161 min (54%)
     Pro       $149 ÷ 1000 min = $0.149/min   break-even at 490 min (49%)

   Both are under cost at full utilisation — that is deliberate and it is
   how metered SaaS normally works, but it means the margin depends on
   customers not using their whole allowance. Overage is priced above
   cost, so a customer who does use it all is not a loss.

   breakEvenMinutes() below computes this from the same numbers the
   pricing page shows, so the two cannot drift apart.
   ═══════════════════════════════════════════════════════════════════ */

/** What a minute of conversation costs us: telephony + model + voice. */
export const COST_PER_MINUTE = Number(process.env.NEXT_PUBLIC_COST_PER_MINUTE ?? '0.304');

/** What a typical call runs to, for turning minutes into a number of calls. */
export const AVERAGE_CALL_MINUTES = 2.5;

export interface Plan {
  id: 'starter' | 'pro' | 'enterprise';
  name: string;
  price: string;
  /** Monthly price in dollars; null when it is quoted rather than listed. */
  amount: number | null;
  period: string;
  minutes: number;
  maxCallMinutes: number;
  overageRate: number;
  highlight: boolean;
  features: string[];
  cta: string;
}

export const PLANS: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    price: '$49',
    amount: 49,
    period: '/month',
    minutes: 300,
    maxCallMinutes: 3,
    overageRate: 0.35,
    highlight: false,
    features: [
      '1 phone number',
      'All 4 vibes',
      '3 ready-made skills',
      'Recordings & transcripts',
      'Email support',
    ],
    cta: 'Start free',
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$149',
    amount: 149,
    period: '/month',
    minutes: 1000,
    maxCallMinutes: 5,
    overageRate: 0.28,
    highlight: true,
    features: [
      '5 phone numbers',
      'All 4 vibes',
      'Every ready-made skill',
      'Custom Skill Builder',
      'WhatsApp + CRM integrations',
      'Priority support',
    ],
    cta: 'Start free',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'Custom',
    amount: null,
    period: '',
    minutes: 3000,
    maxCallMinutes: 8,
    overageRate: 0.20,
    highlight: false,
    features: [
      'Unlimited numbers',
      'Private voice cloning',
      'Dedicated infrastructure',
      'SSO & audit logs',
      'Named success manager',
    ],
    cta: 'Talk to sales',
  },
];

export const planFor = (id?: string | null): Plan =>
  PLANS.find((p) => p.id === (id ?? '').toLowerCase()) ?? PLANS[0];

/** "300 minutes included (~120 calls)" — the line that makes minutes legible. */
export function callsFor(minutes: number): string {
  const low = Math.round(minutes / 3);
  const high = Math.round(minutes / 2);
  return `~${low}–${high} calls`;
}

export const MINUTES_TOOLTIP =
  `A typical call runs 2–3 minutes, so 300 minutes is roughly 100–150 calls. ` +
  `Only time on a connected call counts — ringing and unanswered calls do not.`;

/** Where a plan stops making money, from the same numbers the page shows. */
export function breakEvenMinutes(plan: Plan): number | null {
  if (!plan.amount) return null;
  return Math.round(plan.amount / COST_PER_MINUTE);
}

/* ── A tenant's month ─────────────────────────────────────────────── */

export interface Usage {
  included: number;
  used: number;
  remaining: number;
  percent: number;
  overageMinutes: number;
  overageCost: number;
  /** Everything owed this month: the plan plus any overage. */
  monthCost: number;
  overLimit: boolean;
  resetsAt: string;
  resetsLabel: string;
}

export function usageFor(b: {
  plan?: string | null;
  monthly_minutes_included?: number | null;
  minutes_used_this_month?: number | null;
  overage_rate?: number | null;
} | null | undefined, now = new Date()): Usage {
  const plan = planFor(b?.plan);
  const included = b?.monthly_minutes_included ?? plan.minutes;
  const used = Math.max(0, b?.minutes_used_this_month ?? 0);
  const rate = b?.overage_rate ?? plan.overageRate;

  const overageMinutes = Math.max(0, used - included);
  const overageCost = Math.round(overageMinutes * rate * 100) / 100;

  /* The 1st of next month, which is when the cron clears the counter. */
  const reset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  return {
    included,
    used: Math.round(used * 10) / 10,
    remaining: Math.max(0, Math.round((included - used) * 10) / 10),
    percent: included > 0 ? Math.min(100, Math.round((used / included) * 100)) : 0,
    overageMinutes: Math.round(overageMinutes * 10) / 10,
    overageCost,
    monthCost: Math.round(((plan.amount ?? 0) + overageCost) * 100) / 100,
    overLimit: overageMinutes > 0,
    resetsAt: reset.toISOString(),
    resetsLabel: reset.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
  };
}
