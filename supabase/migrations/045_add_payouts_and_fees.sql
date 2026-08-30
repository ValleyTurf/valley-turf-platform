-- Native payout/fee tracking (Tier 1, Stage 6).
--
-- Stripe's actual processing fee per payment lives on the Charge's
-- balance_transaction (fee/net), not anywhere on the PaymentIntent
-- itself -- an extra API fetch beyond what the webhook payload
-- includes. Same "the real fee lives somewhere non-obvious" lesson
-- already learned the hard way for Jobber (see migration 022's history
-- of jobber_payouts.fee_amount always being 0). Stored here as
-- fee_amount/net_amount columns on the existing payments row (Stage 5,
-- migration 044) rather than a separate table, since it's a 1:1
-- relationship with each payment.
alter table payments add column if not exists fee_amount numeric(10, 2);
alter table payments add column if not exists net_amount numeric(10, 2);

-- Stripe payouts -- the batched bank deposit, same concept as
-- jobber_payouts (migration 021) but for whatever gets processed
-- natively. One row per Stripe Payout object, upserted on
-- stripe_payout_id for the same at-least-once-delivery reason as
-- payments.stripe_payment_intent_id.
create table if not exists stripe_payouts (
  id uuid primary key default gen_random_uuid(),
  stripe_payout_id text not null unique,
  status text not null,
  amount numeric(10, 2) not null default 0,
  currency text,
  arrival_date date,
  -- Stripe auto-schedules payouts by default (daily/weekly/monthly per
  -- the account's payout settings); false would mean it was triggered
  -- manually via the API/Dashboard. Not acted on anywhere yet, just
  -- carried through in case payout cadence ever needs to be surfaced.
  automatic boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stripe_payouts_status_idx on stripe_payouts (status);
create index if not exists stripe_payouts_arrival_date_idx on stripe_payouts (arrival_date);
