-- Round 6-9 of the payment-fee-schema-check investigation found that the
-- real per-transaction credit-card/ACH processing fee does NOT live on
-- jobber_payouts.fee_amount (021_add_jobber_payouts.sql) — that field is
-- confirmed 0 for every payout on this account. The actual fee lives on
-- individual payment records, reachable only through a top-level
-- Query.paymentRecords(...) field (distinct from Invoice.paymentRecords,
-- which returns a differently-shaped, fee-less type) whose nodes are
-- polymorphic: JobberPaymentsCreditCardPaymentRecord and
-- JobberPaymentsACHPaymentRecord both carry their own direct feeAmount,
-- and credit card additionally has surchargeAmount. Round 9 confirmed
-- real values (e.g. $3.93 fee on a $125 charge).
--
-- This is a separate table from jobber_payments (not an added column)
-- because the id returned by this top-level path is in a different
-- GraphQL global-id namespace (e.g. ".../JobberPaymentsCreditCardPaymentRecord/...")
-- than the id already stored as jobber_payments.jobber_payment_id (from
-- Invoice.paymentRecords, a plain PaymentRecord type) — the two aren't a
-- reliable 1:1 key match, so this stores its own id as primary key and
-- links back to the invoice instead.
create table if not exists jobber_payment_fees (
  jobber_payment_record_id text primary key,
  jobber_invoice_id text,
  record_typename text,
  payment_type text,
  adjustment_type text,
  amount numeric not null default 0,
  fee_amount numeric not null default 0,
  surcharge_amount numeric not null default 0,
  entry_date date,
  updated_at timestamptz not null default now()
);

create index if not exists jobber_payment_fees_entry_date_idx
  on jobber_payment_fees (entry_date);

create index if not exists jobber_payment_fees_invoice_id_idx
  on jobber_payment_fees (jobber_invoice_id);
