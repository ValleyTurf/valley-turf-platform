-- Self-service version of the hardcoded SERVICE_COLOR_RULES in
-- app/(platform)/schedule/page.tsx -- Ryan (2026-11-09) asked "is there a
-- menu where I can go and change these colors?" and chose to have a real
-- Settings page built rather than keep asking for a code change every
-- time a service's color needs to move.
--
-- Each row is one keyword-matching rule, equivalent to one of the old
-- hardcoded SERVICE_COLOR_RULES[].test() functions: a visit's normalized
-- service label (lowercased, hyphens collapsed to spaces -- see
-- normalizeServiceText in lib/scheduleServiceColors.ts) must contain
-- EVERY keyword in `keywords` as a substring for the rule to match.
-- Non-default rows are tried in `sort_order` ASC, first match wins --
-- exactly the old array's "checked in order" behavior. A label that
-- matches no rule falls back to the single is_default row's color
-- (there should be exactly one; the partial unique index below enforces
-- it at the DB level since app code can't always be trusted to keep that
-- invariant on its own).
--
-- Where the old code used `a.includes(x) || a.includes(y)` (OR of two
-- whole-phrase spellings -- bimonthly/"bi monthly", "semi annual"/
-- semiannual), that's expressed here as two separate same-color rows in
-- consecutive sort_order slots rather than one row, since a single row's
-- keywords are AND'd together, not OR'd.
--
-- Run this once in the Supabase SQL editor (Project
-- vasskxstyvshfiwgpuxj -> SQL Editor).
create table if not exists schedule_service_colors (
  id uuid primary key default gen_random_uuid(),
  sort_order integer not null default 0,
  label text not null,
  keywords text[] not null default '{}',
  color_key text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- At most one default/fallback row at a time -- enforced here rather
-- than only in the Settings page UI, since that's the row every
-- unmatched service silently falls back to.
create unique index if not exists schedule_service_colors_one_default
  on schedule_service_colors (is_default)
  where is_default;

-- Seed with the exact rules/colors schedule/page.tsx has hardcoded
-- today, in the same order, so turning this on changes nothing on the
-- Schedule until Ryan actually edits something from the new Settings
-- page. No natural unique key exists to hang an ON CONFLICT off of, so
-- idempotency on re-run is instead handled by only seeding when the
-- table is still empty.
insert into schedule_service_colors (sort_order, label, keywords, color_key, is_default)
select * from (
  values
    (10, 'Initial Full Cleaning', array['initial', 'full', 'clean']::text[], 'green', false),
    (20, 'Full Cleaning - Returning', array['full', 'clean', 'return']::text[], 'blue', false),
    (30, 'Bimonthly', array['bimonthly']::text[], 'orange', false),
    (31, 'Bimonthly (alt. spelling)', array['bi monthly']::text[], 'orange', false),
    (40, 'Semi-Annual', array['semi annual']::text[], 'rose', false),
    (41, 'Semi-Annual (alt. spelling)', array['semiannual']::text[], 'rose', false),
    (50, 'Quarterly', array['quarterly']::text[], 'sky', false),
    (60, 'Maintenance Monthly', array['maintenance', 'monthly']::text[], 'purple', false),
    (70, 'Full Monthly', array['full', 'monthly']::text[], 'lime', false),
    (80, 'Spray Only', array['spray', 'only']::text[], 'yellow', false),
    (90, 'Weekly', array['weekly']::text[], 'pink', false),
    (9999, 'Everything else', array[]::text[], 'emerald', true)
) as seed(sort_order, label, keywords, color_key, is_default)
where not exists (select 1 from schedule_service_colors);
