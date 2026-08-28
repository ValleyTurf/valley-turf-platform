-- Revives the orphaned /reactivation page and extends it with richer
-- outreach dispositions (Contacted - Emailed / Text Messaged, Reach Out
-- Again in 3/6 Months, Cleaning Scheduled, Dog Passed Away) plus a
-- recontact-interval column so we can eventually see which follow-up
-- window (3mo vs 6mo) actually converts to a scheduled cleaning.
--
-- Everything below is IF NOT EXISTS / idempotent on purpose. Neither
-- `customers.reactivation_*` (queried by app/(platform)/reactivation
-- since it was built) nor `customer_intelligence_exclusions` (queried by
-- app/(platform)/customers/intelligence) has a tracked migration
-- anywhere in this history -- this codebase has a track record of
-- columns/tables being created directly in Supabase outside of
-- migrations (see git log on app/(platform)/reactivation/page.tsx vs.
-- `grep -rl reactivation supabase/migrations/` turning up nothing). This
-- migration is safe to run whether those already exist live or not, and
-- from here on gives them one authoritative, reproducible definition.

-- Reactivation outreach tracking on customers (candidate -> contacted ->
-- follow-up-scheduled -> cleaning-scheduled/not-interested/removed).
alter table customers
  add column if not exists reactivation_status text,
  add column if not exists reactivation_last_contacted_at timestamptz,
  add column if not exists reactivation_next_follow_up_at timestamptz,
  add column if not exists reactivation_contact_attempts integer not null default 0,
  -- Which "reach out again in X" window this customer was most recently
  -- placed in ('3mo' | '6mo' | null). Deliberately NOT cleared when the
  -- status later moves to 'scheduled' (Cleaning Scheduled) or a
  -- not-interested/removed outcome -- preserving it is what lets
  -- lib/reactivation.ts's buildRecontactGroupStats() report how many
  -- customers in each recontact window actually converted.
  add column if not exists reactivation_recontact_interval text;

create index if not exists idx_customers_reactivation_next_follow_up_at
  on customers (reactivation_next_follow_up_at)
  where reactivation_next_follow_up_at is not null;

create index if not exists idx_customers_reactivation_status
  on customers (reactivation_status)
  where reactivation_status is not null;

-- Customer Intelligence's "Reactivation Pipeline" exclusion reasons
-- (permanent/final dispositions like Moved, Do Not Contact, Dog Passed
-- Away -- distinct from the outreach-workflow statuses above, which
-- represent an active in-progress conversation rather than a final
-- reason someone is off the list for good).
create table if not exists customer_intelligence_exclusions (
  id uuid primary key default gen_random_uuid(),
  jobber_client_id text not null,
  exclusion_type text not null,
  reason text,
  excluded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (jobber_client_id, exclusion_type)
);

create index if not exists idx_customer_intelligence_exclusions_type
  on customer_intelligence_exclusions (exclusion_type);
