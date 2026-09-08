-- Two more automated nudges, same shape as visit_reminder_rules /
-- review_request_settings (055_add_visit_reminders_and_review_requests.sql):
-- a rules table (day-offset + enabled, editable from Settings) plus a
-- dedup-tracking *_sent table so a cron run that overlaps a prior one
-- can't double-send.
--
--   1. Overdue invoice payment reminders -- N days after an invoice's
--      due_date, for any unpaid invoice. Covers both native and
--      Jobber-synced invoices via the existing jobber_invoices mirror
--      (same table Invoiced History/Revenue/Transactions already read),
--      keyed on jobber_invoice_id (text) rather than a uuid FK since
--      that mirror's id is either a real Jobber id or a synthetic
--      "native-<uuid>". Ryan asked for this feature without specifying
--      day-offsets, so it defaults to 3 and 10 days overdue -- adjust
--      from Settings > Notifications like everything else here.
--   2. Quote follow-up nudges -- Ryan's explicit ask: 2 and 5 days after
--      a quote is marked "sent". Quotes never had a sent_at timestamp
--      before (only expires_at, which staff can leave blank), so that's
--      added here and populated going forward by markQuoteStatus.

alter table quotes
  add column if not exists sent_at timestamptz;

create table if not exists invoice_reminder_rules (
  id uuid primary key default gen_random_uuid(),
  days_after integer not null unique,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into invoice_reminder_rules (days_after, enabled)
values (3, true), (10, true)
on conflict (days_after) do nothing;

create table if not exists invoice_reminders_sent (
  id uuid primary key default gen_random_uuid(),
  jobber_invoice_id text not null,
  days_after integer not null,
  sent_at timestamptz not null default now(),
  unique (jobber_invoice_id, days_after)
);

create index if not exists invoice_reminders_sent_invoice_idx
  on invoice_reminders_sent (jobber_invoice_id);

create table if not exists quote_followup_rules (
  id uuid primary key default gen_random_uuid(),
  days_after integer not null unique,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Ryan's requested defaults: 2 days and 5 days after a quote is sent.
insert into quote_followup_rules (days_after, enabled)
values (2, true), (5, true)
on conflict (days_after) do nothing;

create table if not exists quote_followups_sent (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references quotes(id) on delete cascade,
  days_after integer not null,
  sent_at timestamptz not null default now(),
  unique (quote_id, days_after)
);

create index if not exists quote_followups_sent_quote_idx
  on quote_followups_sent (quote_id);
