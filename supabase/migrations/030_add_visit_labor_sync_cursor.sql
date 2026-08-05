-- Resumption state for app/api/jobber/sync-visit-labor/route.ts — same
-- reasoning as jobber_job_notes_sync_state
-- (028_add_job_notes_sync_cursor.sql): the labor-time query nests jobs
-- -> timeSheetEntries, which is expensive enough under Jobber's
-- query-cost throttling that a full backfill across every historical
-- job may need more than one request's time limit to finish. This
-- single-row table remembers the last cursor and whether the full
-- backfill has completed, so hitting the route again picks up where
-- the previous run left off instead of starting over from page 1.
create table if not exists jobber_visit_labor_sync_state (
  id boolean primary key default true,
  cursor text,
  completed boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint jobber_visit_labor_sync_state_singleton check (id)
);
