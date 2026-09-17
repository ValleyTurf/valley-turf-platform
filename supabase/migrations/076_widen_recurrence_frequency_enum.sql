-- Jobber Independence Roadmap -- widens jobber_jobs.recurrence_frequency's
-- check constraint (migration 054) to match what the rest of the app has
-- supported for a while: lib/nativeRecurrence.ts's RecurrenceFrequency
-- type, the "Update recurring schedule" dropdown in ManageJobForm.tsx,
-- and its server action's own validation list all already include
-- 'biweekly' (every 2 weeks) and 'triannual' (every 4 months) -- only the
-- original DB constraint was never updated to match, so saving either
-- value through the UI would fail at the database with a check
-- violation.
--
-- Surfaced by migration 067's Part A cadence backfill: jobs 926/641/1004
-- (genuinely biweekly) and 1227 (genuinely every 4 months) couldn't get
-- an inferred cadence, because the backfill's own bucket list (and
-- lib/jobberMigrationAudit.ts's matching CADENCE_BUCKETS, used for the
-- read-only preview) was missing these two cadences as well -- see the
-- companion edits to both files in this same change.
--
-- Run this before migration 067 (in addition to 068) -- otherwise Part A
-- would still be working against the old, narrower constraint even after
-- its bucket list is fixed.
--
-- Constraint name isn't hardcoded from migration 054 (it never named one
-- explicitly, so Postgres auto-generated a name) -- looked up here
-- instead so this works regardless of what that name turned out to be.
do $$
declare
  found_constraint_name text;
begin
  select con.conname into found_constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_attribute att
    on att.attrelid = rel.oid
    and att.attnum = any(con.conkey)
  where rel.relname = 'jobber_jobs'
    and con.contype = 'c'
    and att.attname = 'recurrence_frequency';

  if found_constraint_name is not null then
    execute format('alter table jobber_jobs drop constraint %I', found_constraint_name);
  end if;
end $$;

alter table jobber_jobs
  add constraint jobber_jobs_recurrence_frequency_check
  check (recurrence_frequency is null or recurrence_frequency in
    ('weekly', 'biweekly', 'bimonthly', 'monthly', 'quarterly', 'triannual', 'semiannual'));
