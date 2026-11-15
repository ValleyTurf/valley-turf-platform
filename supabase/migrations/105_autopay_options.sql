-- Autopay options (ROADMAP "Top 10 (November 2026)" #4). Ryan,
-- 2026-11-15: "some customers like to pay on the 1st of each month, so
-- if we could pick the autopay options that would be good."
--
-- Until now autopay had exactly one behavior: charge the saved card the
-- moment a new invoice is created and sent. autopay_timing adds a
-- per-customer choice:
--   on_invoice          -- charge as soon as the invoice is sent (the
--                          existing behavior, and the default, so nobody
--                          already enrolled changes)
--   day_of_month        -- hold the charge until autopay_day_of_month
--                          (1-28, so it exists in every month)
--   days_after_invoice  -- hold the charge until autopay_delay_days
--                          after the invoice was sent
-- The held charges are made by a daily cron (lib/autopaySchedule.ts).
--
-- autopay_charge_attempts is the record of every card charge autopay
-- tried, whatever triggered it -- the scheduled cron needs it to know
-- an invoice was already attempted today, and it's what lets a failed
-- charge be seen and followed up instead of only living in a server log.
--
-- Run this once in the Supabase SQL editor (Project
-- vasskxstyvshfiwgpuxj -> SQL Editor). Safe to re-run.
alter table customer_payment_methods
  add column if not exists autopay_timing text not null default 'on_invoice',
  add column if not exists autopay_day_of_month integer,
  add column if not exists autopay_delay_days integer;

alter table customer_payment_methods
  drop constraint if exists customer_payment_methods_autopay_timing_check;
alter table customer_payment_methods
  add constraint customer_payment_methods_autopay_timing_check
  check (autopay_timing in ('on_invoice', 'day_of_month', 'days_after_invoice'));

alter table customer_payment_methods
  drop constraint if exists customer_payment_methods_autopay_day_check;
alter table customer_payment_methods
  add constraint customer_payment_methods_autopay_day_check
  check (autopay_day_of_month is null or autopay_day_of_month between 1 and 28);

alter table customer_payment_methods
  drop constraint if exists customer_payment_methods_autopay_delay_check;
alter table customer_payment_methods
  add constraint customer_payment_methods_autopay_delay_check
  check (autopay_delay_days is null or autopay_delay_days between 1 and 60);

create table if not exists autopay_charge_attempts (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  jobber_client_id text,
  -- Phoenix calendar date of the attempt -- what "already tried today"
  -- is checked against.
  attempted_on date not null,
  -- What caused it: invoice_created (sent, charge-on-invoice customer),
  -- scheduled (the daily cron), enrollment (card just saved with an
  -- invoice already open), manual (staff pressed Charge Card on File).
  triggered_by text not null
    check (triggered_by in ('invoice_created', 'scheduled', 'enrollment', 'manual')),
  succeeded boolean not null,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists autopay_charge_attempts_invoice_idx
  on autopay_charge_attempts (invoice_id);
create index if not exists autopay_charge_attempts_attempted_on_idx
  on autopay_charge_attempts (attempted_on);
