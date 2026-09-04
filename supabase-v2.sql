-- ════════════════════════════════════════════════════════════════════
--  KONEK AI — schema v2 (multi-tenant SaaS)
--
--  Run in Supabase → SQL Editor → New query → Run.
--  Idempotent and NON-DESTRUCTIVE: safe to run on a database that
--  already has v1 (supabase.sql). Existing rows are preserved.
--
--  One rename happens: the v1 `business_brain` table held RAG chunks.
--  v2 needs that name for the business profile, so the chunk table is
--  renamed to `brain_chunks` and its data carried over.
-- ════════════════════════════════════════════════════════════════════

create extension if not exists vector;
create extension if not exists pgcrypto;

-- ── 0 · Rename the v1 chunk table out of the way ────────────────────
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_name = 'business_brain' and column_name = 'embedding')
     and not exists (select 1 from information_schema.tables where table_name = 'brain_chunks')
  then
    alter table business_brain rename to brain_chunks;
  end if;
end $$;

create table if not exists brain_chunks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid,
  content text not null,
  source_type text,
  source_name text,
  embedding vector(1536),
  created_at timestamptz default now()
);

-- ── 1 · Businesses (tenants) ────────────────────────────────────────
create table if not exists businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_email text,
  owner_name text,
  created_at timestamptz default now()
);

alter table businesses add column if not exists slug text;
alter table businesses add column if not exists outbound_number text;
alter table businesses add column if not exists plan text default 'starter';
alter table businesses add column if not exists calls_used int default 0;
alter table businesses add column if not exists calls_limit int default 500;
alter table businesses add column if not exists status text default 'active';
alter table businesses add column if not exists mrr int default 0;
alter table businesses add column if not exists active_vibe text default 'PRO_CLOSER';
alter table businesses add column if not exists settings jsonb default '{"whatsapp_followup": true, "sms_fallback": true}'::jsonb;

create unique index if not exists businesses_slug_key on businesses (slug) where slug is not null;

-- ── 2 · Business Brain (one profile row per tenant) ─────────────────
create table if not exists business_brain (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  business_name text,
  what_you_sell text,
  price_range text,
  goal text check (goal in ('Explain','Book','Close')) default 'Book',
  knowledge_files jsonb default '[]'::jsonb,
  website_link text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- One brain per business, so the save path can UPSERT.
create unique index if not exists business_brain_business_key on business_brain (business_id);

-- ── 3 · Campaigns ───────────────────────────────────────────────────
create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  vibe text default 'PRO_CLOSER'
    check (vibe in ('PRO_CLOSER','FRIENDLY_TITO','GEN_Z_HYPE','CALM_CARE')),
  status text default 'Scheduled'
    check (status in ('Running','Completed','Scheduled','Paused')),
  audience_count int default 0,
  called_count int default 0,
  hot_leads int default 0,
  skills text[] default '{}',
  created_at timestamptz default now()
);

-- ── 4 · Contacts ────────────────────────────────────────────────────
create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  name text,
  phone text not null,
  status text default 'Pending',
  custom_fields jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- ── 5 · Call logs ───────────────────────────────────────────────────
create table if not exists call_logs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references businesses(id) on delete cascade,
  campaign_id uuid references campaigns(id) on delete set null,
  contact_id uuid references contacts(id) on delete set null,
  customer_name text,
  phone text,
  skills_used text[] default '{}',
  vibe text,
  duration_seconds int default 0,
  status text default 'Initiated',
  recording_url text,
  transcript text,
  twilio_sid text,
  created_at timestamptz default now()
);

create unique index if not exists call_logs_twilio_sid_key on call_logs (twilio_sid) where twilio_sid is not null;

-- ── 6 · Skills (global catalogue + per-business custom) ─────────────
create table if not exists skills (
  id text primary key,
  name text not null,
  description text,
  category text,
  vibe text,
  system_prompt text not null,
  is_active boolean default true
);

alter table skills add column if not exists business_id uuid references businesses(id) on delete cascade;
alter table skills add column if not exists script text;
alter table skills add column if not exists created_at timestamptz default now();

-- Per-business on/off state for a skill.
create table if not exists business_skills (
  business_id uuid references businesses(id) on delete cascade,
  skill_id text references skills(id) on delete cascade,
  is_active boolean default false,
  primary key (business_id, skill_id)
);

-- ── 7 · Integrations ────────────────────────────────────────────────
create table if not exists business_integrations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  provider text not null,
  is_connected boolean default false,
  api_key text,
  meta jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists business_integrations_key
  on business_integrations (business_id, provider);

-- ── 8 · Indexes ─────────────────────────────────────────────────────
create index if not exists call_logs_business_created_idx on call_logs (business_id, created_at desc);
create index if not exists call_logs_campaign_idx        on call_logs (campaign_id);
create index if not exists contacts_campaign_idx         on contacts (campaign_id, status);
create index if not exists campaigns_business_idx        on campaigns (business_id, status);
create index if not exists brain_chunks_business_idx     on brain_chunks (business_id);
create index if not exists skills_business_idx           on skills (business_id);

-- ── 9 · Seed the 8 ready-made skills (global: business_id is null) ──
insert into skills (id, name, description, category, vibe, system_prompt, script, business_id) values
('closer','Closer Skill','Expert at handling objections and driving every call to a yes','SALES','PRO_CLOSER',
 'You are a pro closer. When the customer says they will think about it, or that the price is high, handle the objection with confidence and close. Offer installments or hold the slot. Always finish with a two-option question, never a yes/no.',
 E'TRIGGER · Customer hesitates or says they need to think about it.\n\nKONEK: "Totally fair — most people want to think it over. Can I ask what is actually holding you back, the price or the timing?"\n\n→ If price: offer the installment plan and free delivery.\n→ If timing: hold the slot free for 48 hours.\n→ Always close with a two-option question, never a yes/no.', null),
('followup','Follow-up Skill','Calls warm leads back on a schedule until they answer','SALES','FRIENDLY_TITO',
 'You follow up politely with leads who did not answer or asked to be called back. Retry at +4 hours, +1 day, then +3 days and stop. Never more than four attempts. Honour any opt-out immediately.',
 E'TRIGGER · No answer, or the customer asked to be called back.\n\nKONEK retries at +4h, +1 day, then +3 days, and stops.\n\n"Hi, it is Kai again from Nova — you mentioned Thursday would be better, so I am keeping my word. Still a good time?"\n\n→ Never more than 4 attempts. Honors opt-out immediately.', null),
('upsell','Upsell Skill','Offers the natural add-on once the customer has said yes','SALES','PRO_CLOSER',
 'After the customer has committed, offer one natural add-on that genuinely improves their result. Make exactly one offer. If declined, move on warmly and re-confirm the original booking.',
 E'TRIGGER · Customer has committed to a purchase or booking.\n\nKONEK: "Perfect, you are booked. One thing — clients who add the aftercare kit see about twice the result, and it is 900 instead of 1,400 when bundled today. Want me to include it?"\n\n→ One offer only. If declined, move on warmly.', null),
('booking','Booking Skill','Checks availability, books the slot and texts confirmation','SUPPORT','CALM_CARE',
 'You book appointments. Offer two concrete slots, confirm the name and number, write the booking, then confirm by SMS. Never offer a slot you have not checked.',
 E'TRIGGER · Customer wants an appointment.\n\nKONEK reads live availability, offers two concrete slots, confirms name and number, writes the booking, then sends an SMS confirmation.\n\n"Locked in — Thursday 2pm with Ana. I am texting the confirmation now."', null),
('faq','FAQ Skill','Answers straight from your Business Brain, never invents','SUPPORT','FRIENDLY_TITO',
 'Answer using the Business Brain knowledge only. If the answer is not in the knowledge you were given, say you do not want to guess and that someone from the team will confirm. Never invent prices, hours or policies.',
 E'TRIGGER · Any question about hours, pricing, location, policy or products.\n\nKONEK answers only from uploaded knowledge. If the answer is not in the Business Brain:\n\n"That one I do not want to guess on — let me have someone from the team confirm and get right back to you."', null),
('collection','Collection Skill','Politely chases an overdue balance','SUPPORT','CALM_CARE',
 'Remind the customer about an overdue balance politely but firmly. Offer to settle in full or split the payment. Never threaten. Always leave a payment link by SMS.',
 E'TRIGGER · Invoice is past due.\n\nKONEK: "Hi Ramon, quick courtesy call — there is a balance of 4,500 from last month. Would you rather settle in full or split it in two?"\n\n→ Never threatening. Always leaves a payment link by SMS.', null),
('winback','Winback Skill','Reaches customers who have gone quiet','MARKETING','GEN_Z_HYPE',
 'Win back customers who have not purchased in 90 days with a genuine returning-customer offer. One call per quarter, maximum.',
 E'TRIGGER · No purchase or visit in 90 days.\n\nKONEK: "Hi Lea, it is Kai from Nova. It has been a while and we missed you — I have a returning-client rate for this month. Want me to pencil you in?"\n\n→ One call per quarter, maximum.', null),
('review','Review Skill','Turns happy customers into public reviews','MARKETING','FRIENDLY_TITO',
 '24 hours after a completed service, ask how it went on a scale of one to ten. If 9 or 10, send the review link while still on the call. If 8 or below, skip the link, capture the reason and flag it for the owner.',
 E'TRIGGER · 24 hours after a completed service.\n\nKONEK: "Hi Jomar, just checking how Tuesday went — on a scale of one to ten?"\n\n→ 9–10: text the review link on the call.\n→ 1–8: skip the link, capture the reason, flag for the owner.', null)
on conflict (id) do update set
  name = excluded.name, description = excluded.description, category = excluded.category,
  vibe = excluded.vibe, system_prompt = excluded.system_prompt, script = excluded.script;

-- ── 10 · Vector search over the renamed chunk table ─────────────────
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

-- ── 11 · Storage bucket for knowledge uploads ───────────────────────
insert into storage.buckets (id, name, public)
values ('knowledge', 'knowledge', true)
on conflict (id) do nothing;

-- ── 12 · Bootstrap the first tenant if the table is empty ───────────
insert into businesses (name, slug, owner_email, outbound_number, plan, calls_used, calls_limit, status, mrr, active_vibe)
select 'Nova Aesthetics', 'nova-aesthetics', 'owner@example.com', '+12232263852', 'pro', 0, 2000, 'active', 149, 'PRO_CLOSER'
where not exists (select 1 from businesses);

-- Give that tenant a brain row and the default two skills switched on.
insert into business_brain (business_id, business_name, what_you_sell, price_range, goal)
select b.id, b.name, 'Skin treatments, facials and aftercare packages', '₱2,500 – ₱12,800', 'Book'
from businesses b
where not exists (select 1 from business_brain bb where bb.business_id = b.id);

insert into business_skills (business_id, skill_id, is_active)
select b.id, s.id, true from businesses b cross join (values ('booking'),('faq')) as s(id)
on conflict (business_id, skill_id) do nothing;

-- ── 13 · Row Level Security ─────────────────────────────────────────
-- Still OFF. The API routes use the service-role key, which bypasses RLS.
-- Enable it and add auth.uid()-scoped policies before real tenants share
-- this database. See README_BACKEND.md.
