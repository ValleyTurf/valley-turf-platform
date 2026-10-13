-- Ryan (2026-10-13): "no stripe processing fees show in here because
-- they don't hit a bank account. How do I account for those?" -- the
-- fee data already existed (payments.fee_amount from
-- lib/stripeWebhookProcessor.ts's handlePaymentIntentSucceeded, and
-- jobber_payment_fees.fee_amount/surcharge_amount from
-- app/api/jobber/sync-payment-fees/route.ts -- see migrations 044 and
-- 022), but neither source ever turned into an actual `expenses` row,
-- so it never reduced the P&L bottom line and never showed up here for
-- review. Ryan: "Yes, let's do both" -- wire both sources in.
--
-- Each fee gets auto-logged as its own pre-categorized (category
-- bank_fees, status 'categorized' -- vendor/amount are already known
-- with certainty, no human review needed) expense row the moment the
-- fee is known: from handlePaymentIntentSucceeded for native Stripe
-- charges, and from the existing payment-fee sync for Jobber-processed
-- ones. Both call lib/paymentFeeExpenses.ts, which upserts on one of
-- these two columns so a Stripe webhook retry or a re-run of the daily
-- Jobber sync can never create a second expense row for the same fee --
-- same idempotency reasoning as expenses.plaid_transaction_id
-- (migration 090) for the bank feed.
--
-- Two separate nullable+unique columns rather than one shared
-- "external reference" column, matching how this table already links
-- out to other tables by their own real id (jobber_client_id,
-- plaid_transaction_id, bank_account_id) instead of a generic key.
alter table expenses
  add column if not exists stripe_charge_id text unique,
  add column if not exists jobber_payment_record_id text
    references jobber_payment_fees(jobber_payment_record_id) on delete set null;

alter table expenses
  drop constraint if exists expenses_jobber_payment_record_id_key;

alter table expenses
  add constraint expenses_jobber_payment_record_id_key unique (jobber_payment_record_id);

-- expenses.source (migration 087) only allowed 'manual' and 'bank_feed'
-- -- neither fits a row this app generated on its own from fee data
-- Stripe/Jobber reported, so it gets its own value rather than being
-- mislabeled as either.
alter table expenses
  drop constraint if exists expenses_source_check;

alter table expenses
  add constraint expenses_source_check
  check (source in ('manual', 'bank_feed', 'processing_fee'));
