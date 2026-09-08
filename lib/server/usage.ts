import { getBusiness, updateBusiness, updateCallLog, safe } from '@/lib/server/tenant';
import { COST_PER_MINUTE, planFor, usageFor } from '@/lib/pricing';
import type { CallLog } from '@/lib/types2';

/* ═══════════════════════════════════════════════════════════════════
   Turning a finished call into minutes on a bill.

   Called from the Twilio status callback, which Twilio retries. So the
   call row is stamped when its minutes are counted, and a second
   delivery of the same callback adds nothing — double-billing a customer
   is worse than missing a webhook.

   Only connected time counts. Ringing, busy and no-answer cost the
   tenant nothing, which is both fair and what they will expect.
   ═══════════════════════════════════════════════════════════════════ */

const UNBILLED = new Set(['Failed', 'No Answer', 'Initiated', 'Busy', 'Canceled']);

export interface Metered {
  metered: boolean;
  minutes: number;
  cost: number;
  reason?: string;
}

export async function recordCallUsage(call: CallLog, durationSeconds: number): Promise<Metered> {
  /* Already counted — Twilio delivered this callback twice. */
  if (call.metered_at) {
    return { metered: false, minutes: call.duration_minutes ?? 0, cost: call.cost ?? 0, reason: 'already counted' };
  }

  const seconds = Math.max(0, durationSeconds || call.duration_seconds || 0);
  const minutes = Math.round((seconds / 60) * 100) / 100;
  const billable = !UNBILLED.has(String(call.status)) && seconds > 0 && !call.is_trial;

  /* A demo call is our cost of sale, not the tenant's. It is still
     measured, so the margin on the funnel is visible. */
  const cost = Math.round(minutes * COST_PER_MINUTE * 100) / 100;

  await safe(() => updateCallLog(call.id, {
    duration_minutes: minutes,
    cost,
    billable,
    metered_at: new Date().toISOString(),
  }), null);

  if (!billable || !call.business_id) {
    return { metered: false, minutes, cost, reason: call.is_trial ? 'demo call' : 'not a connected call' };
  }

  const business = await safe(() => getBusiness(call.business_id), null);
  if (!business) return { metered: false, minutes, cost, reason: 'no tenant' };

  const before = business.minutes_used_this_month ?? 0;
  const after = Math.round((before + minutes) * 100) / 100;
  await safe(() => updateBusiness(business.id, { minutes_used_this_month: after }), null);

  const plan = planFor(business.plan);
  const included = business.monthly_minutes_included ?? plan.minutes;
  const rate = business.overage_rate ?? plan.overageRate;

  console.log(
    `[Usage] ${business.name}: +${minutes} min (${after}/${included}), call cost $${cost.toFixed(2)}`
  );

  if (after > included) {
    /* Only the minutes past the allowance are charged on top. */
    const overMinutes = Math.round((after - Math.max(before, included)) * 100) / 100;
    const overCost = Math.round(overMinutes * rate * 100) / 100;
    console.log(
      `[Overage] ${business.name}: ${Math.round((after - included) * 10) / 10} min over = ` +
      `$${(Math.round((after - included) * rate * 100) / 100).toFixed(2)} this month ` +
      `(+$${overCost.toFixed(2)} from this call)`
    );
  }

  return { metered: true, minutes, cost };
}

/** What the dashboard shows, computed from the tenant's own numbers. */
export function usageSummary(business: Parameters<typeof usageFor>[0]) {
  return usageFor(business);
}
