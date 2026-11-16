-- Month-end close (migration 113): one row per month that has been closed,
-- with a snapshot of the numbers at the time so a later change can be
-- spotted. Reopening a month deletes its row.
create table if not exists month_closes (
  month text primary key check (month ~ '^[0-9]{4}-[0-9]{2}$'),
  closed_at timestamptz not null default now(),
  closed_by_user_id uuid,
  closed_by_name text,
  notes text,
  snapshot jsonb not null default '{}'::jsonb,
  open_items_at_close integer not null default 0
);
