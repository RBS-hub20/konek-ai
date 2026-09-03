-- ════════════════════════════════════════════════════════════════════
--  KONEK AI — database schema
--  Run this in the Supabase dashboard → SQL Editor → New query → Run.
--  Safe to re-run: everything is guarded with "if not exists".
-- ════════════════════════════════════════════════════════════════════

-- pgvector, for Business Brain embeddings
create extension if not exists vector;

-- ── Businesses / Tenants ────────────────────────────────────────────
create table if not exists businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_email text not null,
  owner_name text,
  what_you_sell text,
  price text,
  goal text check (goal in ('explain','book','close')),
  vibe text default 'PRO CLOSER',
  plan text default 'starter' check (plan in ('starter','pro','enterprise')),
  calls_used int default 0,
  calls_limit int default 500,
  status text default 'active',
  mrr int default 49,
  twilio_number text,
  whatsapp_enabled boolean default true,
  created_at timestamptz default now()
);

-- ── Skills catalogue ────────────────────────────────────────────────
create table if not exists skills (
  id text primary key,                    -- 'closer', 'booking', ...
  name text not null,
  description text,
  category text check (category in ('sales','support','marketing')),
  vibe text,
  system_prompt text not null,
  is_active boolean default true
);

-- ── Which skills each business has switched on ──────────────────────
create table if not exists business_skills (
  business_id uuid references businesses(id) on delete cascade,
  skill_id text references skills(id) on delete cascade,
  is_active boolean default false,
  primary key (business_id, skill_id)
);

-- ── Custom skills built in the Skill Builder ────────────────────────
create table if not exists custom_skills (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references businesses(id) on delete cascade,
  name text not null,
  description text,
  trigger_type text,                      -- 'When customer says...' etc.
  trigger_value text,
  vibe text,
  system_prompt text,
  created_at timestamptz default now()
);

-- ── Call log ────────────────────────────────────────────────────────
create table if not exists calls (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references businesses(id) on delete cascade,
  customer_name text,
  customer_phone text,
  skills_used text[],
  vibe text,
  duration int default 0,                 -- seconds
  status text default 'initiated',        -- initiated | connected | no_answer | hot_lead | booked | completed
  recording_url text,
  transcript text,
  twilio_sid text,
  created_at timestamptz default now()
);

-- ── Business Brain (RAG source) ─────────────────────────────────────
create table if not exists business_brain (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references businesses(id) on delete cascade,
  content text not null,
  source_type text,                       -- pdf | website | manual | file
  source_name text,
  embedding vector(1536),
  created_at timestamptz default now()
);

-- ── Indexes ─────────────────────────────────────────────────────────
create index if not exists calls_business_created_idx on calls (business_id, created_at desc);
create index if not exists brain_business_idx on business_brain (business_id);
create index if not exists custom_skills_business_idx on custom_skills (business_id);

-- ── Seed the 8 ready-made skills ────────────────────────────────────
insert into skills (id, name, description, category, vibe, system_prompt) values
('closer','Closer Skill','Expert at handling objections and driving every call to a yes','sales','PRO CLOSER','You are a pro closer. When the customer says they will think about it, or that the price is high, handle the objection with confidence and close. Offer installments or hold the slot. Always finish with a two-option question, never a yes/no.'),
('followup','Follow-up Skill','Calls warm leads back on schedule','sales','FRIENDLY TITO','You follow up politely with leads who did not answer or asked to be called back. Retry at +4 hours, +1 day, then +3 days and stop. Never more than four attempts. Honour any opt-out immediately.'),
('upsell','Upsell Skill','Offers add-on after yes','sales','PRO CLOSER','After the customer has committed, offer one natural add-on that genuinely improves their result. Make exactly one offer. If declined, move on warmly and re-confirm the original booking.'),
('booking','Booking Skill','Books appointments to calendar','support','CALM CARE','You book appointments. Offer two concrete slots, confirm the name and number, write the booking, then confirm by SMS. Never offer a slot you have not checked.'),
('faq','FAQ Skill','Answers product questions from brain','support','FRIENDLY TITO','Answer using the Business Brain knowledge only. If the answer is not in the knowledge you were given, say you do not want to guess and that someone from the team will confirm. Never invent prices, hours or policies.'),
('collection','Collection Skill','Polite payment reminder','support','CALM CARE','Remind the customer about an overdue balance politely but firmly. Offer to settle in full or split the payment. Never threaten. Always leave a payment link by SMS.'),
('winback','Winback Skill','Calls old customers with offer','marketing','GEN-Z HYPE','Win back customers who have not purchased in 90 days with a genuine returning-customer offer. One call per quarter, maximum.'),
('review','Review Skill','Asks for 5-star review','marketing','FRIENDLY TITO','24 hours after a completed service, ask how it went on a scale of one to ten. If 9 or 10, send the review link while still on the call. If 8 or below, skip the link, capture the reason and flag it for the owner.')
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  vibe = excluded.vibe,
  system_prompt = excluded.system_prompt;

-- ── Vector similarity search for the Business Brain ─────────────────
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
  from business_brain b
  where b.business_id = match_business_id
    and b.embedding is not null
  order by b.embedding <=> query_embedding
  limit match_count;
$$;

-- ── Row Level Security ──────────────────────────────────────────────
-- Left OFF deliberately: this MVP talks to Supabase from server-side API
-- routes using the service-role key, which bypasses RLS anyway. Before
-- exposing the anon key to real tenants, enable RLS on every table and
-- add policies keyed to auth.uid(). See README_BACKEND.md.
