-- Crew assignment on visits (roadmap: "My Day" work, step 1 of 4 --
-- assignment itself; personalized My Day, mark-complete, and the job
-- timer are separate follow-ups that build on this).
--
-- Deliberately owned entirely by this app, not synced to/from Jobber --
-- Jobber has its own assignedUsers concept on visits (visitEditAssignedUsers,
-- discovered during earlier schema introspection) but wiring into that
-- would mean mapping this app's own staff accounts to Jobber's separate
-- team-member records. Since My Day is already this app's own read
-- surface (not Jobber's calendar), a local table is simpler and avoids
-- that mapping problem entirely.
--
-- One row per visit (single assignee for now) -- jobber_visit_id is the
-- primary key, so assigning a new person to an already-assigned visit is
-- just an upsert, not an insert-then-delete.
--
-- Run this once in the Supabase SQL editor (Project vasskxstyvshfiwgpuxj -> SQL Editor).

create table if not exists visit_assignments (
  jobber_visit_id text primary key,
  assigned_user_id uuid not null references users(id) on delete cascade,
  assigned_by uuid references users(id) on delete set null,
  assigned_at timestamptz not null default now()
);

create index if not exists visit_assignments_user_idx
  on visit_assignments (assigned_user_id);
