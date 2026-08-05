-- Historical labor duration pulled from Jobber's own time tracking
-- (Job > Labor section > timeSheetEntries, confirmed live via the now-
-- deleted property-labor-schema-check diagnostic route). Jobber ties
-- each time entry to a "targetItem" that can be a specific Visit, the
-- whole Job, or an Assessment — only entries targeting a specific
-- Visit are summed in here, since anything targeting the Job as a
-- whole can't be attributed to one visit without guessing.
--
-- One row per visit (not per time entry): duration_seconds is the SUM
-- of every entry's finalDuration for that visit (covers multiple
-- crew members logging time on the same visit), entry_count is how
-- many entries contributed, mostly for debugging/sanity-checking.
--
-- This is a separate table from visit_time_logs
-- (019_add_visit_time_logs.sql) on purpose: visit_time_logs is this
-- app's OWN live start/stop timer data (My Day job timer feature),
-- while this is a one-time historical import of Jobber's numbers for
-- visits that happened before this app had a timer at all. The
-- customer page only falls back to this when visit_time_logs has
-- nothing for that visit — see getVisitLaborMinutes in
-- app/(platform)/customers/[id]/page.tsx.
create table if not exists jobber_visit_labor (
  id uuid primary key default gen_random_uuid(),
  jobber_visit_id text not null unique,
  jobber_job_id text not null,
  jobber_client_id text not null,
  duration_seconds integer not null default 0,
  entry_count integer not null default 0,
  synced_at timestamptz not null default now()
);

create index if not exists jobber_visit_labor_client_idx
  on jobber_visit_labor (jobber_client_id);
