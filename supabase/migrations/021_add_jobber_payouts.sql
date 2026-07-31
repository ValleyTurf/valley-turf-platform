-- Jobber Payments payout records — where processing fees actually live.
-- jobber_payments already captures each individual payment (and its
-- tip_amount), but Jobber charges its processing fee at the PAYOUT
-- level (payments get batched into a payout that lands in the bank
-- account 1-2 days later), not on the individual payment. Confirmed via
-- four rounds of live introspection (the payment-fee-schema-check
-- diagnostic route, since deleted): PayoutRecord has direct
-- feeAmount/grossAmount/netAmount fields.
--
-- feeAmount/gross_amount/net_amount are typed as Int in Jobber's schema
-- (PaymentRecord.amount is a Float, by contrast) -- strong signal these
-- are cent-integers rather than dollars, so the sync route divides by
-- 100. Worth a sanity check against Jobber's own Payouts screen the
-- first time real data lands, in case that assumption is wrong.
--
-- Run this once in the Supabase SQL editor (Project vasskxstyvshfiwgpuxj -> SQL Editor).

create table if not exists jobber_payouts (
  jobber_payout_id text primary key,
  identifier text,
  payout_status text,
  payout_method text,
  payout_type text,
  currency text,
  gross_amount numeric not null default 0,
  fee_amount numeric not null default 0,
  net_amount numeric not null default 0,
  arrival_date date,
  payout_created_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists jobber_payouts_arrival_date_idx
  on jobber_payouts (arrival_date);
