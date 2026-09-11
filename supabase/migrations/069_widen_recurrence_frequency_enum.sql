-- Jobber Independence Roadmap -- follow-up to 067_migrate_jobber_to_native.sql.
-- Running that migration's verification query turned up 5 recurring jobs
-- whose real-world cadence didn't fit any of the original five buckets
-- (weekly/bimonthly/monthly/quarterly/semiannual, migration 054): 3 jobs
-- titled "Bi-Weekly"/"Biweekly Maintenance" (every 2 weeks) and 1 titled
-- "Full Cleaning - Every 4 months". Rather than force those onto the
-- closest existing option (which would silently change what the customer
-- is actually being served on), this adds 'biweekly' and 'triannual'
-- ("three times a year" -- every 4 months, same naming pattern as
-- 'semiannual' for every 6 months) as real, first-class cadences.
--
-- Companion code changes (lib/nativeRecurrence.ts's date math,
-- lib/jobberJob.ts's RRULE mapping, the New/Manage Job forms' frequency
-- dropdowns, and both server actions' validation whitelists) ship
-- alongside this migration -- run this migration whenever, but the two
-- new options won't be selectable in the UI or accepted by either job
-- action until that code is deployed too.
--
-- After this runs, go fix the 5 jobs the 067 verification query flagged:
-- open each one and use the "Update recurring schedule" toggle to set it
-- to Biweekly or Every 4 Months, with the correct next visit date.
--
-- Run this once in the Supabase SQL editor (Project vasskxstyvshfiwgpuxj
-- -> SQL Editor).

-- Postgres auto-names a column-level CHECK added via "add column ...
-- check (...)" as <table>_<column>_check -- confirmed against migration
-- 054's exact DDL shape (no explicit constraint name was given there).
-- If this DROP reports the constraint doesn't exist, check its real name
-- first with:
--   select conname from pg_constraint
--   where conrelid = 'jobber_jobs'::regclass and contype = 'c';
alter table jobber_jobs
  drop constraint if exists jobber_jobs_recurrence_frequency_check;

alter table jobber_jobs
  add constraint jobber_jobs_recurrence_frequency_check
  check (recurrence_frequency is null or recurrence_frequency in
    ('weekly', 'biweekly', 'bimonthly', 'monthly', 'quarterly', 'triannual', 'semiannual'));
