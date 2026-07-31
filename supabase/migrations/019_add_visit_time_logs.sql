-- Job timer on My Day (roadmap: "My Day" work, step 4 of 4) -- lets a
-- tech start a clock when they begin a visit and stop it when they're
-- done, so actual time-on-site gets recorded. Entirely local to this
-- app (Jobber has no equivalent concept to sync with) and deliberately
-- NOT wired into job costing yet -- this just records duration for now;
-- feeding it into the labor line on Log Job Costs is a separate step
-- once there's real timer data to look at.
--
-- One row per start/stop segment (a visit can have multiple segments if
-- paused and resumed, and multiple people can each have their own rows
-- on the same visit for a 2-person job). stopped_at is null while the
-- timer is running.
--
-- Run this once in the Supabase SQL editor (Project vasskxstyvshfiwgpuxj -> SQL Editor).

create table if not exists visit_time_logs (
  id uuid primary key default gen_random_uuid(),
  jobber_visit_id text not null,
  user_id uuid not null references users(id) on delete cascade,
  started_at timestamptz not null default now(),
  stopped_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists visit_time_logs_visit_idx
  on visit_time_logs (jobber_visit_id);

-- Enforces "one active timer per person" cheaply at query time (the app
-- also checks this before inserting) -- a partial index over just the
-- running rows, since that's the only set this constraint cares about.
create index if not exists visit_time_logs_active_idx
  on visit_time_logs (user_id)
  where stopped_at is null;
