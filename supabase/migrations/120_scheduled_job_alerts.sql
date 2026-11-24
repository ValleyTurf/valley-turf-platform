-- Watchdog for scheduled jobs (lib/cronWatch.ts). One row per problem
-- ("incident") with a job, so the same missed or failing job alerts once,
-- reminds at most once a day, and is closed when the job runs fine again.
create table if not exists scheduled_job_alerts (
  id uuid primary key default gen_random_uuid(),
  sync_type text not null,
  problem text not null check (problem in ('late', 'failed', 'stuck')),
  detail text,
  opened_at timestamptz not null default now(),
  -- Last time someone was told (null until the first alert actually goes out;
  -- alerts wait for 7am-9pm Phoenix time).
  last_notified_at timestamptz,
  resolved_at timestamptz
);

create index if not exists scheduled_job_alerts_open_idx
  on scheduled_job_alerts (sync_type)
  where resolved_at is null;
