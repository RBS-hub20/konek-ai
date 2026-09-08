-- ═══════════════════════════════════════════════════════════════════
-- Pricing by the minute instead of by the call.
--
-- Safe to run more than once. The tenant table here is `businesses` —
-- this schema has never had a `tenants` table.
--
-- Why: a call is not a unit of cost. Twilio, the model and the voice all
-- bill per minute, so "500 calls for $49" prices a two-minute call and a
-- ten-minute call the same and loses money on the second one.
-- ═══════════════════════════════════════════════════════════════════

alter table businesses add column if not exists plan_name                text;
alter table businesses add column if not exists monthly_minutes_included int   default 300;
alter table businesses add column if not exists minutes_used_this_month  float default 0;
alter table businesses add column if not exists max_call_minutes         int   default 3;
alter table businesses add column if not exists overage_rate             float default 0.35;
-- When the current allowance started, so the reset is idempotent rather
-- than "whatever ran last".
alter table businesses add column if not exists minutes_period_start     timestamptz default date_trunc('month', now());

-- Per call, so a month's usage can be recomputed from the calls that made
-- it rather than trusted as a running total.
alter table call_logs add column if not exists duration_minutes float;
alter table call_logs add column if not exists cost             float;
alter table call_logs add column if not exists billable         boolean default true;
-- Set once the call has been added to the tenant's total, so a retried
-- Twilio callback cannot bill the same minutes twice.
alter table call_logs add column if not exists metered_at       timestamptz;

-- Existing tenants get the allowance for the plan they are already on.
update businesses set
  plan_name                = coalesce(plan_name, plan, 'starter'),
  monthly_minutes_included = case lower(coalesce(plan, 'starter'))
                               when 'pro' then 1000
                               when 'enterprise' then 3000
                               else 300 end,
  max_call_minutes         = case lower(coalesce(plan, 'starter'))
                               when 'pro' then 5
                               when 'enterprise' then 8
                               else 3 end,
  overage_rate             = case lower(coalesce(plan, 'starter'))
                               when 'pro' then 0.28
                               when 'enterprise' then 0.20
                               else 0.35 end
where monthly_minutes_included is null
   or max_call_minutes is null
   or overage_rate is null
   or plan_name is null;

-- Backfill what the existing call rows already imply, so the first month
-- of usage is not blank. Nothing is marked metered: these predate billing.
update call_logs
   set duration_minutes = round((coalesce(duration_seconds, 0) / 60.0)::numeric, 2)
 where duration_minutes is null;

create index if not exists call_logs_metering_idx
  on call_logs (business_id, created_at desc)
  where metered_at is not null;

notify pgrst, 'reload schema';
