-- Tier 3 (Jobber Independence Roadmap, "customer-facing gaps"). Two
-- separate features share this migration since they're the same shape
-- (a settings row + a dedup-tracking table):
--
--   1. Pre-visit reminders -- automated SMS/email sent to a customer N
--      days before their visit. Ryan wants two reminders per visit (4
--      days out and 2 days out), configurable rather than hardcoded, so
--      each reminder is its own row in visit_reminder_rules instead of a
--      fixed pair of env vars.
--   2. Review requests -- built and wired per Ryan's request, but
--      deliberately shipped OFF (review_request_settings.enabled
--      defaults false). Nothing sends until Ryan flips it on from
--      Settings once he's ready.
--
-- Both use their own *_sent dedup table rather than a boolean column on
-- jobber_visits, because a single visit can get more than one reminder
-- (the 4-day AND the 2-day rule) -- a dedup row per (visit, rule) is the
-- only way to know which specific reminder already went out.

create table if not exists visit_reminder_rules (
  id uuid primary key default gen_random_uuid(),
  days_before integer not null unique,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Ryan's requested defaults: a reminder 4 days out and another 2 days
-- out, both on from the start. Edited from Settings going forward, not
-- redeployed -- ON CONFLICT DO NOTHING so re-running this migration
-- can't clobber a day-offset Ryan already changed.
insert into visit_reminder_rules (days_before, enabled)
values (4, true), (2, true)
on conflict (days_before) do nothing;

create table if not exists visit_reminders_sent (
  id uuid primary key default gen_random_uuid(),
  jobber_visit_id text not null,
  days_before integer not null,
  sent_at timestamptz not null default now(),
  unique (jobber_visit_id, days_before)
);

create index if not exists visit_reminders_sent_visit_idx
  on visit_reminders_sent (jobber_visit_id);

-- Single-row settings table, same singleton pattern as
-- native_job_number_counters (migration 054). enabled defaults false on
-- purpose -- see header comment. google_review_url is left for Ryan to
-- fill in from Settings (his Google Business Profile short review link)
-- before turning this on; the send logic no-ops without one regardless
-- of `enabled`, as a second guard against firing with nowhere to send
-- customers.
create table if not exists review_request_settings (
  id integer primary key default 1,
  enabled boolean not null default false,
  days_after_visit integer not null default 1,
  google_review_url text,
  updated_at timestamptz not null default now(),
  constraint review_request_settings_singleton check (id = 1)
);

insert into review_request_settings (id, enabled, days_after_visit)
values (1, false, 1)
on conflict (id) do nothing;

create table if not exists review_requests_sent (
  id uuid primary key default gen_random_uuid(),
  jobber_visit_id text not null unique,
  sent_at timestamptz not null default now()
);

create index if not exists review_requests_sent_visit_idx
  on review_requests_sent (jobber_visit_id);
