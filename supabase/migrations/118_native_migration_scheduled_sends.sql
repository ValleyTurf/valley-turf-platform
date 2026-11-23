-- "Send at 9am" for the Migration page (/invoices/migration). A batch of
-- invites is saved here when it is queued outside the 9am-6pm Phoenix window
-- (or whenever someone picks "send at 9am"), and a daily cron sends it at
-- the next 9am Phoenix. Skip rules (already native, card saved, opted out,
-- invited recently) are checked at send time, not when queued.
create table if not exists native_migration_scheduled_sends (
  id uuid primary key default gen_random_uuid(),
  jobber_client_ids text[] not null,
  template text not null,
  scheduled_by_name text,
  -- Earliest moment the batch may go out (a 9:00am Phoenix time).
  send_after timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'sent', 'canceled', 'failed')),
  -- Per-customer outcomes once sent (same shape the page shows after a send).
  results jsonb,
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists native_migration_scheduled_sends_due_idx
  on native_migration_scheduled_sends (status, send_after);
