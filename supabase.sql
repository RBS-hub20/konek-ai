-- ════════════════════════════════════════════════════════════════════
--  KONEK AI — complete database schema
--
--  THE ONLY SQL FILE YOU NEED. Run it in Supabase → SQL Editor → Run.
--
--  · Idempotent — safe to run as many times as you like.
--  · Non-destructive — CREATE TABLE IF NOT EXISTS + ADD COLUMN IF NOT
--    EXISTS throughout, so existing rows are never dropped.
--  · Ends with NOTIFY pgrst so PostgREST reloads its schema cache
--    immediately (this is what clears "Could not find column X in the
--    schema cache" without waiting or redeploying).
-- ════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;
create extension if not exists vector;

-- ── 0 · Carry v1 forward ────────────────────────────────────────────
-- v1's business_brain held RAG chunks. v2 needs that name for the tenant
-- profile, so the chunk table is renamed and keeps its rows.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_name = 'business_brain' and column_name = 'embedding')
     and not exists (select 1 from information_schema.tables where table_name = 'brain_chunks')
  then
    alter table business_brain rename to brain_chunks;
  end if;
end $$;

-- ── 1 · Businesses (tenants) ────────────────────────────────────────
create table if not exists businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

alter table businesses add column if not exists slug            text;
alter table businesses add column if not exists outbound_number text;
alter table businesses add column if not exists phone_number    text;   -- alias
alter table businesses add column if not exists vibe            text default 'PRO_CLOSER';
alter table businesses add column if not exists active_vibe     text default 'PRO_CLOSER';
alter table businesses add column if not exists language        text default 'EN';   -- EN | TL | TAGLISH | AR | HI
alter table businesses add column if not exists auto_language   boolean default true; -- mirror the caller's language mid-call
alter table businesses add column if not exists handoff_number  text;                 -- transfer here when a caller asks for a person
alter table businesses add column if not exists handoff_backup  text;                 -- tried if the first does not answer
alter table businesses add column if not exists handoff_enabled boolean default true;
alter table businesses add column if not exists handoff_mode    text default 'on_request';
  -- ai_only | if_interested | on_request
alter table businesses add column if not exists industry        text;
alter table businesses add column if not exists address         text;
alter table businesses add column if not exists city            text;
alter table businesses add column if not exists country         text;
alter table businesses add column if not exists hours           text;
alter table businesses add column if not exists logo_url        text;
alter table businesses add column if not exists onboarded_at    timestamptz;          -- null = wizard not finished
alter table businesses add column if not exists goal            text default 'Book';
alter table businesses add column if not exists what_you_sell   text;
alter table businesses add column if not exists industry        text;
alter table businesses add column if not exists owner_email     text;
alter table businesses add column if not exists owner_name      text;
alter table businesses add column if not exists plan            text default 'starter';
alter table businesses add column if not exists calls_used      int  default 0;
alter table businesses add column if not exists calls_limit     int  default 500;
alter table businesses add column if not exists status          text default 'active';
alter table businesses add column if not exists mrr             int  default 0;
alter table businesses add column if not exists settings        jsonb default '{"whatsapp_followup": true, "sms_fallback": true}'::jsonb;

-- v1 declared owner_email NOT NULL, which blocks auto-creating a tenant.
alter table businesses alter column owner_email drop not null;

create unique index if not exists businesses_slug_key on businesses (slug) where slug is not null;

-- ── 2 · Business Brain (one profile row per tenant) ─────────────────
create table if not exists business_brain (
  id uuid primary key default gen_random_uuid(),
  business_id uuid,
  created_at timestamptz default now()
);

alter table business_brain add column if not exists business_name   text;
alter table business_brain add column if not exists what_you_sell   text;
alter table business_brain add column if not exists price_range     text;
alter table business_brain add column if not exists goal            text default 'Book';
alter table business_brain add column if not exists knowledge_files jsonb default '[]'::jsonb;
alter table business_brain add column if not exists website_link    text;
alter table business_brain add column if not exists updated_at      timestamptz default now();

create unique index if not exists business_brain_business_key on business_brain (business_id);

-- ── 3 · Knowledge chunks (RAG) ──────────────────────────────────────
create table if not exists brain_chunks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid,
  content text,
  created_at timestamptz default now()
);
alter table brain_chunks add column if not exists source_type text;
alter table brain_chunks add column if not exists source_name text;
alter table brain_chunks add column if not exists embedding   vector(1536);

-- ── 4 · Campaigns ───────────────────────────────────────────────────
create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  business_id uuid,
  name text,
  created_at timestamptz default now()
);
alter table campaigns add column if not exists vibe           text default 'PRO_CLOSER';
alter table campaigns add column if not exists status         text default 'Scheduled';
alter table campaigns add column if not exists audience_count int  default 0;
alter table campaigns add column if not exists called_count   int  default 0;
alter table campaigns add column if not exists hot_leads      int  default 0;
alter table campaigns add column if not exists skills         text[] default '{}';

-- ── 5 · Contacts & Leads ────────────────────────────────────────────
create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid,
  campaign_id uuid,
  phone text,
  created_at timestamptz default now()
);
alter table contacts add column if not exists name          text;
alter table contacts add column if not exists status        text default 'Pending';
alter table contacts add column if not exists custom_fields jsonb default '{}'::jsonb;

-- Outbound sales leads. Not a tenant's customers — these are companies KONEK
-- itself is selling to, worked from the super admin console.
create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  business_id uuid,
  campaign_id uuid,
  contact_id uuid,
  name text,
  phone text,
  status text default 'New',
  notes text,
  created_at timestamptz default now()
);
alter table leads add column if not exists company        text;
alter table leads add column if not exists contact_person text;
alter table leads add column if not exists industry       text;
alter table leads add column if not exists country        text;
alter table leads add column if not exists last_called_at timestamptz;
alter table leads add column if not exists call_count     int default 0;
alter table leads add column if not exists twilio_sid     text;

create index if not exists leads_status_idx on leads (status, created_at desc);

-- Platform-wide configuration for the super admin console, including the
-- sales numbers an interested lead is transferred to.
create table if not exists platform_settings (
  key text primary key,
  value jsonb default '{}'::jsonb,
  updated_at timestamptz default now()
);

insert into platform_settings (key, value)
values ('sales', '{"manager_number": null, "backup_number": null, "whisper": true}'::jsonb)
on conflict (key) do nothing;

-- ── 5b · Services / menu / price list ───────────────────────────────
-- One row per thing the business sells. The agent quotes from these, so a
-- price change here changes what it says on the next call.
create table if not exists services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid,
  name text,
  created_at timestamptz default now()
);
alter table services add column if not exists price       text;
alter table services add column if not exists description text;
alter table services add column if not exists duration    text;
alter table services add column if not exists category    text;
alter table services add column if not exists is_active   boolean default true;
alter table services add column if not exists sort_order  int default 0;

create index if not exists services_business_idx on services (business_id, sort_order);

-- ── 6 · Call logs ───────────────────────────────────────────────────
create table if not exists call_logs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid,
  created_at timestamptz default now()
);

alter table call_logs add column if not exists campaign_id      uuid;
alter table call_logs add column if not exists contact_id       uuid;
alter table call_logs add column if not exists lead_id          uuid;
alter table call_logs add column if not exists phone            text;
alter table call_logs add column if not exists phone_number     text;   -- alias
alter table call_logs add column if not exists to_number        text;   -- alias
alter table call_logs add column if not exists from_number      text;
alter table call_logs add column if not exists customer_name    text;
alter table call_logs add column if not exists name             text;   -- alias
alter table call_logs add column if not exists vibe             text;
alter table call_logs add column if not exists language         text;
alter table call_logs add column if not exists status           text default 'Initiated';
alter table call_logs add column if not exists transcript       text;
alter table call_logs add column if not exists recording_url    text;
alter table call_logs add column if not exists summary          text;
alter table call_logs add column if not exists duration_seconds int default 0;
alter table call_logs add column if not exists cost_cents       int default 0;
alter table call_logs add column if not exists skills_used      text[] default '{}';
alter table call_logs add column if not exists twilio_sid       text;
alter table call_logs add column if not exists transferred_to   text;
alter table call_logs add column if not exists transfer_status  text;   -- requested | connected | no_answer | failed

create unique index if not exists call_logs_twilio_sid_key on call_logs (twilio_sid) where twilio_sid is not null;

-- ── 7 · Skills ──────────────────────────────────────────────────────
create table if not exists skills (
  id text primary key,
  name text not null,
  created_at timestamptz default now()
);
alter table skills add column if not exists description   text;
alter table skills add column if not exists category      text;
alter table skills add column if not exists vibe          text;
alter table skills add column if not exists system_prompt text;
alter table skills add column if not exists script        text;
alter table skills add column if not exists business_id   uuid;   -- null = global
alter table skills add column if not exists is_active     boolean default true;

-- v1 declared system_prompt NOT NULL; keep it optional so inserts never fail.
alter table skills alter column system_prompt drop not null;

create table if not exists business_skills (
  business_id uuid,
  skill_id text,
  is_active boolean default false,
  primary key (business_id, skill_id)
);

-- ── 8 · Integrations ────────────────────────────────────────────────
create table if not exists business_integrations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid,
  provider text,
  created_at timestamptz default now()
);
alter table business_integrations add column if not exists is_connected boolean default false;
alter table business_integrations add column if not exists api_key      text;
alter table business_integrations add column if not exists meta         jsonb default '{}'::jsonb;
alter table business_integrations add column if not exists updated_at   timestamptz default now();

create unique index if not exists business_integrations_key
  on business_integrations (business_id, provider);

-- ── 9 · Indexes ─────────────────────────────────────────────────────
create index if not exists call_logs_business_created_idx on call_logs (business_id, created_at desc);
create index if not exists call_logs_campaign_idx         on call_logs (campaign_id);
create index if not exists contacts_campaign_idx          on contacts (campaign_id, status);
create index if not exists campaigns_business_idx         on campaigns (business_id, status);
create index if not exists brain_chunks_business_idx      on brain_chunks (business_id);
create index if not exists skills_business_idx            on skills (business_id);

-- ── 10 · Seed the 8 ready-made skills (global) ──────────────────────
insert into skills (id, name, description, category, vibe, system_prompt, script, business_id) values
('closer','Closer Skill','Expert at handling objections and driving every call to a yes','SALES','PRO_CLOSER',
 'You are a pro closer. When the customer says they will think about it, or that the price is high, handle the objection with confidence and close. Offer installments or hold the slot. Always finish with a two-option question, never a yes/no.',
 E'TRIGGER · Customer hesitates or says they need to think about it.\n\nKONEK: "Totally fair — most people want to think it over. Can I ask what is actually holding you back, the price or the timing?"\n\n→ If price: offer the installment plan and free delivery.\n→ If timing: hold the slot free for 48 hours.\n→ Always close with a two-option question.', null),
('followup','Follow-up Skill','Calls warm leads back on a schedule until they answer','SALES','FRIENDLY_TITO',
 'You follow up politely with leads who did not answer or asked to be called back. Retry at +4 hours, +1 day, then +3 days and stop. Never more than four attempts. Honour any opt-out immediately.',
 E'TRIGGER · No answer, or the customer asked to be called back.\n\nKONEK retries at +4h, +1 day, then +3 days, and stops.\n\n→ Never more than 4 attempts. Honors opt-out immediately.', null),
('upsell','Upsell Skill','Offers the natural add-on once the customer has said yes','SALES','PRO_CLOSER',
 'After the customer has committed, offer one natural add-on that genuinely improves their result. Make exactly one offer. If declined, move on warmly and re-confirm the original booking.',
 E'TRIGGER · Customer has committed to a purchase or booking.\n\n→ One offer only. If declined, move on warmly.', null),
('booking','Booking Skill','Checks availability, books the slot and texts confirmation','SUPPORT','CALM_CARE',
 'You book appointments. Offer two concrete slots, confirm the name and number, write the booking, then confirm by SMS. Never offer a slot you have not checked.',
 E'TRIGGER · Customer wants an appointment.\n\n"Locked in — Thursday 2pm with Ana. I am texting the confirmation now."', null),
('faq','FAQ Skill','Answers straight from your Business Brain, never invents','SUPPORT','FRIENDLY_TITO',
 'Answer using the Business Brain knowledge only. If the answer is not in the knowledge you were given, say you do not want to guess and that someone from the team will confirm. Never invent prices, hours or policies.',
 E'TRIGGER · Any question about hours, pricing, location, policy or products.\n\n"That one I do not want to guess on — let me have someone confirm and get right back to you."', null),
('collection','Collection Skill','Politely chases an overdue balance','SUPPORT','CALM_CARE',
 'Remind the customer about an overdue balance politely but firmly. Offer to settle in full or split the payment. Never threaten. Always leave a payment link by SMS.',
 E'TRIGGER · Invoice is past due.\n\n→ Never threatening. Always leaves a payment link by SMS.', null),
('winback','Winback Skill','Reaches customers who have gone quiet','MARKETING','GEN_Z_HYPE',
 'Win back customers who have not purchased in 90 days with a genuine returning-customer offer. One call per quarter, maximum.',
 E'TRIGGER · No purchase or visit in 90 days.\n\n→ One call per quarter, maximum.', null),
('review','Review Skill','Turns happy customers into public reviews','MARKETING','FRIENDLY_TITO',
 '24 hours after a completed service, ask how it went on a scale of one to ten. If 9 or 10, send the review link while still on the call. If 8 or below, skip the link, capture the reason and flag it for the owner.',
 E'TRIGGER · 24 hours after a completed service.\n\n→ 9–10: text the review link on the call.\n→ 1–8: capture the reason, flag for the owner.', null)
on conflict (id) do update set
  name = excluded.name, description = excluded.description, category = excluded.category,
  vibe = excluded.vibe, system_prompt = excluded.system_prompt, script = excluded.script;

-- ── 11 · Vector search over the chunks ──────────────────────────────
create or replace function match_business_brain (
  query_embedding vector(1536),
  match_business_id uuid,
  match_count int default 5
)
returns table (id uuid, content text, source_name text, similarity float)
language sql stable
as $$
  select b.id, b.content, b.source_name,
         1 - (b.embedding <=> query_embedding) as similarity
  from brain_chunks b
  where b.business_id = match_business_id and b.embedding is not null
  order by b.embedding <=> query_embedding
  limit match_count;
$$;

-- ── 12 · Storage bucket for knowledge uploads ───────────────────────
insert into storage.buckets (id, name, public)
values ('knowledge', 'knowledge', true)
on conflict (id) do nothing;

-- ── 13 · Default tenant, if there is none ───────────────────────────
insert into businesses (name, slug, owner_email, outbound_number, phone_number,
                        plan, calls_used, calls_limit, status, mrr, vibe, active_vibe,
                        language, auto_language, what_you_sell, goal)
select 'Nova Aesthetics', 'nova-aesthetics', 'owner@konek.ai', '+12232263852', '+12232263852',
       'pro', 0, 2000, 'active', 149, 'PRO_CLOSER', 'PRO_CLOSER',
       'EN', true, 'Skin treatments, facials and aftercare packages', 'Book'
where not exists (select 1 from businesses);

insert into business_brain (business_id, business_name, what_you_sell, price_range, goal)
select b.id, b.name, 'Skin treatments, facials and aftercare packages', '₱2,500 – ₱12,800', 'Book'
from businesses b
where not exists (select 1 from business_brain bb where bb.business_id = b.id);

insert into business_skills (business_id, skill_id, is_active)
select b.id, s.id from businesses b cross join (values ('booking'),('faq'),('closer')) as s(id)
on conflict (business_id, skill_id) do nothing;

-- ── 14 · Row Level Security ─────────────────────────────────────────
-- Permissive for now. The API routes use the service-role key, which bypasses
-- RLS entirely; these policies simply keep the anon key working and silence
-- Supabase's "RLS disabled" warning. They grant everyone full access — tighten
-- to auth.uid()-scoped policies before real tenants share this database.
do $$
declare t text;
begin
  foreach t in array array[
    'businesses','business_brain','brain_chunks','campaigns','contacts','leads',
    'call_logs','skills','business_skills','business_integrations','services',
    'platform_settings'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "Allow all" on %I', t);
    execute format('create policy "Allow all" on %I for all using (true) with check (true)', t);
  end loop;
end $$;

-- ── 14b · Duplicate tenants (informational) ─────────────────────────
-- Before this file existed, an empty businesses table could be seeded more
-- than once. This does not delete anything; it just shows you any duplicates
-- so you can remove the extras yourself:
--
--   select id, name, outbound_number, created_at from businesses order by created_at;
--   delete from businesses where id = '<the newer duplicate id>';
--
-- After this file has run, the slug unique index prevents it recurring.
update businesses set slug = 'nova-aesthetics'
where slug is null
  and id = (select id from businesses order by created_at asc limit 1);

-- ── 15 · Reload PostgREST's schema cache ────────────────────────────
-- New tables and columns can still read as "not found in the schema cache"
-- until PostgREST reloads. This notify usually handles it, but the reload can
-- race a long migration and pick up a half-applied schema.
--
-- If Schema Health still shows columns missing after running this, run just
-- this one line again on its own:
--
--   notify pgrst, 'reload schema';
--
-- The function below exposes the same thing over the API, so the Reload cache
-- button on /super-admin/settings can do it without opening the SQL editor.
create or replace function public.reload_schema_cache()
returns text
language plpgsql
security definer
as $$
begin
  notify pgrst, 'reload schema';
  return 'schema cache reload requested';
end;
$$;

grant execute on function public.reload_schema_cache() to anon, authenticated, service_role;

notify pgrst, 'reload schema';
