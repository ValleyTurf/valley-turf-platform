-- Historical notes + photos entered directly in Jobber before this
-- CRM's own visit_notes existed (see 026_add_visit_notes_and_turf_range.sql).
--
-- These are NOT forced into visit_notes as if they belonged to a
-- specific past visit: live introspection against Jobber's GraphQL API
-- confirmed Jobber has no per-visit granularity for notes at all —
-- `Visit.notes` and `Job.notes` return the exact same note IDs, because
-- Jobber only ever stores these at the JOB level. One real example
-- pulled during that check ("FCS in March/June/Sept/December", created
-- days before the nearest visit) was clearly a standing job instruction,
-- not something logged during that visit — so guessing an attribution
-- by nearest date would misrepresent the data. This table keeps them as
-- what they actually are: notes on a job, shown on the customer page as
-- their own "Imported from Jobber" block underneath (not interleaved
-- with) the per-visit notes list.
--
-- jobber_note_id is the natural idempotency key — the backfill sync
-- (app/api/jobber/sync-job-notes/route.ts) upserts on it, so it's safe
-- to re-run.
create table if not exists jobber_job_notes (
  id uuid primary key default gen_random_uuid(),
  jobber_note_id text not null unique,
  jobber_job_id text not null,
  jobber_client_id text not null,
  job_number text,
  message text,
  photo_paths text[] not null default '{}',
  jobber_created_at timestamptz,
  synced_at timestamptz not null default now()
);

create index if not exists jobber_job_notes_client_idx
  on jobber_job_notes (jobber_client_id, jobber_created_at);

-- Photos reuse the existing public visit-photos bucket (see
-- 026_add_visit_notes_and_turf_range.sql for its public-read policy —
-- already covers every object in the bucket regardless of path prefix)
-- under a jobber-import/ prefix, so no new bucket or policy is needed
-- here.
