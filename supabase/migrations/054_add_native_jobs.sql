-- Tier 2, Stage 1 -- "native job/visit tables as system of record" (see
-- the Jobber Independence Roadmap, Tier 2). Rather than build a parallel
-- jobs/visits schema and rewrite the 30+ files that already read
-- jobber_jobs/jobber_visits (schedule, my-day, crew-status, customer
-- page, invoices, job-costing, recurring-services, materials, tips,
-- visit notes, the portal...), this evolves the existing tables in
-- place. They're already this app's read model -- everything downstream
-- reads from them, not from Jobber directly -- so the only thing that
-- needs to change is the WRITE path: new jobs/visits get created here
-- directly instead of round-tripping through Jobber's jobCreate
-- mutation and waiting for a sync to pull them back down.
--
-- source distinguishes the two: 'jobber' for anything that still lives
-- in Jobber (the entire existing history, and anything not yet migrated
-- off Jobber), 'native' for anything this app creates going forward.
-- Confirmed with Ryan (2026-09-02): crews use this app exclusively, not
-- Jobber's own mobile app/calendar, so a native job needing to also
-- exist in Jobber for crew visibility is a non-issue -- native can be
-- the real thing from day one, no dual-write transition period needed.
alter table jobber_jobs
  add column if not exists source text not null default 'jobber',
  -- Only Jobber-sourced jobs' instructions live in Jobber itself (fetched
  -- live via fetchJobDetails' JOB_DETAILS_QUERY) -- this column exists so
  -- native jobs, which have nowhere else to keep it, have somewhere to.
  -- Stays null for jobber-sourced rows; the local column is simply
  -- ignored for those.
  add column if not exists instructions text,
  -- Drives the recurring visit generator (Stage 3) -- null for one-time
  -- jobs and for every jobber-sourced job (Jobber owns its own
  -- recurrence, this app doesn't need to know the cadence for those).
  add column if not exists recurrence_frequency text
    check (recurrence_frequency is null or recurrence_frequency in
      ('weekly', 'bimonthly', 'monthly', 'quarterly', 'semiannual')),
  -- The first visit's date -- the generator computes every future
  -- occurrence forward from this anchor rather than from "today", so the
  -- cadence stays locked to the date the job was actually scheduled to
  -- start on.
  add column if not exists recurrence_anchor_date date,
  -- How far the generator has already generated visits through -- a
  -- separate cursor from "the latest visit that currently exists",
  -- because skipping a visit deletes its row. Without its own cursor,
  -- skipping the single furthest-out generated occurrence would make the
  -- generator think it hadn't been generated yet and recreate it on the
  -- next run. Advances every time createNativeJob or
  -- generateUpcomingNativeVisits generates a batch; skip/complete never
  -- touch it.
  add column if not exists recurrence_generated_through date;

alter table jobber_visits
  add column if not exists source text not null default 'jobber';

create index if not exists jobber_jobs_source_idx on jobber_jobs (source);
create index if not exists jobber_visits_source_idx on jobber_visits (source);

-- Human-readable native job numbers, visually distinct from Jobber's own
-- plain-integer job numbers (e.g. "N-1" vs "1042") so staff can never
-- mistake one system's number for the other's. Single global counter
-- (not year-scoped like invoice numbers) -- Jobber's own job numbering
-- isn't year-scoped either, and there's no bookkeeping reason for native
-- job numbers to reset annually the way invoice numbers do.
create table if not exists native_job_number_counters (
  id integer primary key default 1,
  last_number integer not null default 0,
  constraint native_job_number_counters_singleton check (id = 1)
);

-- Atomic under concurrent calls, same pattern as next_invoice_number()
-- in migration 043: the ON CONFLICT DO UPDATE branch takes a row lock on
-- the single counter row for the duration of the transaction.
create or replace function next_native_job_number() returns text as $$
declare
  next_num integer;
begin
  insert into native_job_number_counters (id, last_number)
  values (1, 1)
  on conflict (id) do update
    set last_number = native_job_number_counters.last_number + 1
  returning last_number into next_num;

  return 'N-' || next_num;
end;
$$ language plpgsql;
