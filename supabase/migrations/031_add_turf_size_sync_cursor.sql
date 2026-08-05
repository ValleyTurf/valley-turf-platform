-- Resumption state for app/api/jobber/sync-turf-size/route.ts.
--
-- The first version of this route had no cursor and no time-budget
-- protection — it looped through every client page in one invocation
-- and wrote customers.turf_size_range one row at a time, sequentially.
-- With enough customers that sequence of individual round trips alone
-- was slow enough to blow past Vercel's function time limit and get a
-- raw platform 504 (FUNCTION_INVOCATION_TIMEOUT) instead of a clean
-- JSON response — the exact failure mode
-- jobber_job_notes_sync_state/028_add_job_notes_sync_cursor.sql was
-- built to avoid for the job-notes backfill. Same fix here: remember
-- the last cursor and whether the full sync has completed, so hitting
-- the route again picks up where the previous run left off instead of
-- starting over from page 1 (or timing out with nothing saved).
create table if not exists jobber_turf_size_sync_state (
  id boolean primary key default true,
  cursor text,
  completed boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint jobber_turf_size_sync_state_singleton check (id)
);
