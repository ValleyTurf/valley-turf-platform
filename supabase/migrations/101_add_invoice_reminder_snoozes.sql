-- Temporary per-invoice reminder pause -- Ryan, 2026-10-31: "Can you
-- pause Katie Ray receiving invoice reminders for one week? If she has
-- not paid by then we will restart them and if she has then I will
-- close them out."
--
-- Sibling to invoice_reminder_overrides (migration 081), which forces an
-- invoice INTO the daily reminder tail early -- this is the opposite:
-- forces an invoice OUT of all reminders (both the fixed-day rules and
-- the daily tail) until a given date, then lets it resume automatically
-- with no further action needed, which is the whole point -- Ryan
-- doesn't have to remember to come turn it back on a week from now.
--
-- snoozed_until is the first date reminders resume, not the last date
-- they're paused -- lib/invoiceReminders.ts's processReminderBatch skips
-- an invoice whenever todayPhoenix < snoozed_until. A customer who pays
-- in the meantime never reaches that date anyway (Ryan closes the
-- invoice out himself, same as any other paid invoice) -- nothing here
-- needs to know that happened, and the row is harmless left behind.
--
-- Run this once in the Supabase SQL editor (Project vasskxstyvshfiwgpuxj
-- -> SQL Editor).
create table if not exists invoice_reminder_snoozes (
  jobber_invoice_id text primary key,
  snoozed_until date not null,
  reason text,
  created_at timestamptz not null default now()
);

-- Katie Ray, 2026-10-31: pause both her currently-unpaid invoices for one
-- week -- INV-2026-0031 (due 2026-09-26, already in the daily overdue
-- tail) and INV-2026-0049 (due 2026-10-31, issued the same day as this
-- request, not yet overdue but would otherwise start nagging her soon).
insert into invoice_reminder_snoozes (jobber_invoice_id, snoozed_until, reason)
values
  (
    'native-fef791b3-1087-4fc3-a259-241b31e56793',
    '2026-11-06',
    'Ryan, 2026-10-31: pause Katie Ray for a week -- restart if unpaid by then, otherwise he''ll close it out.'
  ),
  (
    'native-a44c0b26-0d18-4a71-8243-0109417ca537',
    '2026-11-06',
    'Ryan, 2026-10-31: pause Katie Ray for a week -- restart if unpaid by then, otherwise he''ll close it out.'
  )
on conflict (jobber_invoice_id) do update
  set snoozed_until = excluded.snoozed_until, reason = excluded.reason;
