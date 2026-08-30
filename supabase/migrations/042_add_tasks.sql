-- Shared team task list -- a flat add/check-off/delete list, visible to
-- everyone with general_access (same section as Dashboard, Schedule,
-- Customer Map). Deliberately simple: no assignees, due dates, or
-- categories -- just a description and done/not done, per what was
-- actually asked for.
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  is_done boolean not null default false,
  created_by_user_id uuid references users(id) on delete set null,
  created_by_name text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_is_done_created_at_idx
  on tasks (is_done, created_at);
