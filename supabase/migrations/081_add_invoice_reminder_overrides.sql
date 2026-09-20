-- Ryan (2026-09-20): Elise Ludeman's invoice (native invoice id
-- bdb86ce4-f78f-4ad9-9592-99cfa3c964ae, mirrored as
-- native-bdb86ce4-f78f-4ad9-9592-99cfa3c964ae in jobber_invoices) has a
-- due_date of 2026-09-29 -- still in the future -- but it's already been
-- about a week and Ryan wants her reminded daily starting now regardless
-- of that due date. lib/invoiceReminders.ts's daily-tail phase normally
-- only picks up invoices whose due_date has already passed the last
-- fixed-day rule; this table is a small manual override list it also
-- checks, for the rare case Ryan wants an invoice nagged daily without
-- waiting on (or touching) its real due_date. Add a row here any time
-- that's needed again; delete the row (or just let the invoice get
-- marked paid) to stop.
create table if not exists invoice_reminder_overrides (
  jobber_invoice_id text primary key,
  reason text,
  created_at timestamptz not null default now()
);

insert into invoice_reminder_overrides (jobber_invoice_id, reason)
values (
  'native-bdb86ce4-f78f-4ad9-9592-99cfa3c964ae',
  'Ryan, 2026-09-20: Elise Ludeman, INV-2026-0021 -- remind daily starting now even though due_date (2026-09-29) hasn''t arrived; it''s already been about a week.'
)
on conflict (jobber_invoice_id) do nothing;
