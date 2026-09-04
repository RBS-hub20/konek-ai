import { env, hasStripe } from '@/lib/env';
import { fail, ok, readJson, describeError } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/* Plans mirror the pricing section on the landing page. */
const PLANS = {
  starter: { name: 'KONEK AI · Starter', amount: 4900, calls: 500 },
  pro: { name: 'KONEK AI · Pro', amount: 14900, calls: 2000 },
} as const;

type PlanId = keyof typeof PLANS;

/**
 * POST /api/stripe/checkout — { plan: 'starter' | 'pro', businessId?, email? }
 * Returns a Checkout URL. Without STRIPE_SECRET_KEY it returns a mock URL so
 * the upgrade flow is still clickable.
 */
export async function POST(req: Request) {
  const body = await readJson<{ plan?: string; businessId?: string; email?: string }>(req);
  const planId = (body?.plan ?? 'pro') as PlanId;
  const plan = PLANS[planId];
  if (!plan) return fail(`Unknown plan "${planId}". Use starter or pro.`);

  if (!hasStripe) {
    return ok({
      mock: true,
      plan: planId,
      url: `/admin?checkout=mock&plan=${planId}`,
      note: 'No STRIPE_SECRET_KEY — returning a mock checkout URL.',
    });
  }

  try {
    const { default: Stripe } = await import('stripe');
    const stripe = new Stripe(env.stripeSecret);

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: plan.amount,
            recurring: { interval: 'month' },
            product_data: {
              name: plan.name,
              description: `${plan.calls.toLocaleString()} calls per month`,
            },
          },
        },
      ],
      success_url: `${env.appUrl}/admin?checkout=success&plan=${planId}`,
      cancel_url: `${env.appUrl}/admin?checkout=cancelled`,
      ...(body?.email ? { customer_email: body.email } : {}),
      metadata: { plan: planId, businessId: body?.businessId ?? '' },
    });

    return ok({ mock: false, plan: planId, url: session.url, sessionId: session.id });
  } catch (err) {
    return fail('Could not create checkout session', 500, describeError(err).detail);
  }
}

/** GET — the plans available for checkout. */
export async function GET() {
  return ok({
    live: hasStripe,
    publishableKey: env.stripePublishable || null,
    plans: Object.entries(PLANS).map(([id, p]) => ({ id, ...p, price: `$${p.amount / 100}` })),
  });
}
