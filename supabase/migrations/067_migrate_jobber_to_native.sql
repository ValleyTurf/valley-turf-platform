-- Jobber Independence Roadmap -- the cutover itself (roadmap #8/#9):
-- relabels the entire existing customer/job/visit history as
-- natively-owned (source: 'jobber' -> 'native'), so this app stops
-- treating them as things Jobber still owns. Invoicing/payments are
-- untouched -- they stay wired to Jobber for a later, separate
-- migration.
--
-- ############################  READ THIS FIRST  ############################
-- Do NOT run this until, in this order:
--   1. Every code change in this cutover is deployed (the routing fix in
--      lib/nativeJobs.ts/lib/jobberJob.ts/lib/jobberVisit.ts, the
--      disabled sync-customers/sync-jobs/sync-visits + 5 satellite sync
--      routes, the webhook no-ops in lib/jobberWebhookProcessor.ts). Safe
--      to deploy any time before this runs -- everything is still
--      source='jobber' until Part B below, so behavior is unchanged.
--   2. 068_add_job_line_items_snapshot.sql has been run.
--   3. GET /api/jobber/audit-migration has been reviewed (read-only) and
--      then GET /api/jobber/audit-migration?apply=true has been run, with
--      missingLocallyTotal at zero for customers/jobs/visits. If it's not
--      zero, figure out why before proceeding -- Part B below relabels
--      whatever exists locally as the new source of truth, so anything
--      still missing at that point stays missing permanently once Jobber
--      writes are cut off.
--
-- Run the whole thing in the Supabase SQL editor (Project
-- vasskxstyvshfiwgpuxj -> SQL Editor) in TWO steps, not one paste:
--   Step 1: select and run everything from `begin;` down through the
--     three verification selects in Part C (everything before the final
--     `commit;`). Read the query results.
--     - The three "select source, count(*)" results should show the
--       full existing history moving from 'jobber' to 'native' and
--       nothing left on 'jobber' except brand-new rows created by staff
--       during the review window (fine -- those are real jobber-sourced
--       gaps the audit tool will catch on its next run, not a bug here).
--     - The last query (recurring jobs still missing
--       recurrence_frequency) should be empty or a short list you've
--       already seen in the audit tool's recurringCadence* fields and are
--       fine fixing by hand afterward via each job's "Update recurring
--       schedule" toggle.
--   Step 2: if that all looks right, select and run just `commit;` on its
--     own. If anything looks wrong, run `rollback;` instead and nothing
--     written by Part A/B is kept.
-- #############################################################################

begin;

-- ---------------------------------------------------------------------
-- Part A: recurrence backfill, derived from each recurring job's own
-- existing visit spacing (no Jobber call needed -- this app already has
-- the visit history locally). Every non-archived, still-Jobber-sourced
-- job whose type looks recurring and doesn't already have a
-- recurrence_frequency gets the closest cadence bucket
-- (weekly/bimonthly/monthly/quarterly/semiannual -- migration 054's
-- enum) inferred from the median gap between its visits, with generous
-- (+/-25%) tolerance on each bucket -- same tolerance the migration
-- audit tool's read-only cadence preview already used, so nothing here
-- should surprise you if you reviewed that report first.
--
-- recurrence_anchor_date/recurrence_generated_through are both set to
-- the LATEST existing visit's date, not the first -- this keeps cadence
-- phase correct and keeps lib/nativeRecurrence.ts's forward-walk
-- (capped at 500 iterations) from having to walk years of history for
-- an old job, which could otherwise silently generate zero visits for
-- it the first time generateUpcomingNativeVisits runs. See migration
-- 054's header comment on these two columns for the fuller reasoning.
--
-- A job left with recurrence_frequency still null after this (no gap
-- could be computed -- 0 or 1 visits -- or the gap didn't land in any
-- bucket, e.g. a genuinely biweekly cadence, which isn't in the enum)
-- is caught by the verification query in Part C below and needs a
-- by-hand fix afterward via that job's "Update recurring schedule"
-- toggle in the Manage Job form.
with job_visit_gaps as (
  select
    v.jobber_job_id,
    v.start_at::date as visit_date,
    lag(v.start_at::date) over (
      partition by v.jobber_job_id order by v.start_at
    ) as prev_visit_date
  from jobber_visits v
  join jobber_jobs j on j.jobber_job_id = v.jobber_job_id
  where j.job_type ilike '%recur%'
    and j.job_status <> 'archived'
    and j.recurrence_frequency is null
    and j.source = 'jobber'
    and v.start_at is not null
),
gaps as (
  select jobber_job_id, (visit_date - prev_visit_date) as gap_days
  from job_visit_gaps
  where prev_visit_date is not null
),
median_gaps as (
  select
    jobber_job_id,
    percentile_cont(0.5) within group (order by gap_days) as median_gap_days
  from gaps
  group by jobber_job_id
),
bucketed as (
  select
    jobber_job_id,
    case
      when median_gap_days between 7 * 0.75 and 7 * 1.25 then 'weekly'
      when median_gap_days between 30 * 0.75 and 30 * 1.25 then 'monthly'
      when median_gap_days between 60 * 0.75 and 60 * 1.25 then 'bimonthly'
      when median_gap_days between 90 * 0.75 and 90 * 1.25 then 'quarterly'
      when median_gap_days between 180 * 0.75 and 180 * 1.25 then 'semiannual'
      else null
    end as recurrence_bucket
  from median_gaps
),
latest_visit as (
  select jobber_job_id, max(start_at)::date as latest_visit_date
  from jobber_visits
  group by jobber_job_id
)
update jobber_jobs j
set
  recurrence_frequency = b.recurrence_bucket,
  recurrence_anchor_date = lv.latest_visit_date,
  recurrence_generated_through = lv.latest_visit_date
from bucketed b
join latest_visit lv on lv.jobber_job_id = b.jobber_job_id
where j.jobber_job_id = b.jobber_job_id
  and b.recurrence_bucket is not null;

-- ---------------------------------------------------------------------
-- Part B: the flip. Everything still source='jobber' becomes
-- source='native' -- this app is now the system of record for all
-- three. (Quotes and invoicing/payments are untouched -- quotes never
-- had a source column, invoicing/payments stay wired to Jobber for a
-- later migration.)
update customers     set source = 'native' where source = 'jobber';
update jobber_jobs   set source = 'native' where source = 'jobber';
update jobber_visits set source = 'native' where source = 'jobber';

-- ---------------------------------------------------------------------
-- Part C: verification -- review these before running `commit;` (see
-- the two-step instructions above).
-- ---------------------------------------------------------------------

-- Everything relabeled: 'jobber' should be gone (or close to it -- any
-- remaining 'jobber' rows are new records created during the review
-- window between the audit's apply pass and this transaction, which is
-- fine).
select source, count(*) from customers group by 1;
select source, count(*) from jobber_jobs group by 1;
select source, count(*) from jobber_visits group by 1;

-- Recurring jobs still missing a cadence after Part A -- expect this to
-- match (or be a subset of) what the migration audit tool's
-- recurringCadenceCannotBeInferred/recurringCadenceOutsideEnum already
-- showed you. Fix these by hand afterward via each job's "Update
-- recurring schedule" toggle.
select jobber_job_id, job_number, title, job_status
from jobber_jobs
where job_type ilike '%recur%'
  and job_status <> 'archived'
  and recurrence_frequency is null;

-- Run on its own, after reviewing the above. Run `rollback;` instead if
-- anything looks wrong.
commit;
