-- Resumption state for app/api/jobber/sync-job-notes/route.ts.
--
-- The job-notes backfill query nests two levels of paginated
-- connections (a job's notes, then each note's fileAttachments), which
-- turned out to be expensive enough under Jobber's query-cost
-- throttling that the batch sizes had to be cut well below every other
-- sync route's. At that size, a business with a large job history may
-- not finish in a single request's time limit — and without this,
-- every re-run started back over from the first page instead of
-- continuing. This single-row table just remembers the last cursor and
-- whether the full backfill has completed, so hitting the route again
-- picks up where the previous run left off.
create table if not exists jobber_job_notes_sync_state (
  id boolean primary key default true,
  cursor text,
  completed boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint jobber_job_notes_sync_state_singleton check (id)
);
