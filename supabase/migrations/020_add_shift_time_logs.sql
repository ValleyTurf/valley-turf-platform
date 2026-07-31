-- General clock-in/clock-out for payroll -- distinct from
-- visit_time_logs (019_add_visit_time_logs.sql), which times an
-- individual visit for job costing. An employee clocks in once at the
-- start of their workday and out at the end, regardless of how many
-- separate jobs they touch in between -- this is what feeds /timecards
-- for payroll, not job costing. The two systems are deliberately kept
-- independent: a tech's per-visit job timer and their daily shift clock
-- can legitimately disagree (drive time, a lunch break, a morning
-- huddle -- none of that belongs to any one visit).
--
-- One row per clock-in/clock-out segment. clocked_out_at is null while
-- the shift is still running (same "one active row per person" shape as
-- visit_time_logs).
--
-- Run this once in the Supabase SQL editor (Project vasskxstyvshfiwgpuxj -> SQL Editor).

create table if not exists shift_time_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  clocked_in_at timestamptz not null default now(),
  clocked_out_at timestamptz,
  notes text,
  -- Set only when a manager/admin adds or corrects an entry from
  -- /timecards (a missed clock-out, a forgotten punch, etc.) -- null
  -- means the employee punched it themselves. The full before/after of
  -- any correction is also written to audit_log; this column is just a
  -- quick "was this touched by someone else" flag for display on the
  -- employee's own /timeclock history.
  edited_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shift_time_logs_user_idx
  on shift_time_logs (user_id);

-- Enforces "one active shift per person" cheaply at query time (the app
-- also checks this before inserting), same pattern as
-- visit_time_logs_active_idx.
create index if not exists shift_time_logs_active_idx
  on shift_time_logs (user_id)
  where clocked_out_at is null;

create index if not exists shift_time_logs_clocked_in_idx
  on shift_time_logs (clocked_in_at);
