-- Native bank feed, Phase 2 of the QuickBooks replacement (Ryan,
-- 2026-10-05 picking back up "I think we can do an import and then use
-- the bank feed starting 10/1 maybe?"). Phase 1 (the QuickBooks
-- historical import through 9/30/2026) is done -- this is the actual
-- bank connection that takes over from 10/1 forward.
--
-- Provider: Plaid. Checked live same day -- Plaid confirms Mountain
-- America Credit Union as a supported institution with transaction
-- history access; Stripe Financial Connections has no public
-- per-institution list to verify against, so Plaid is the one with
-- confirmed support.
--
-- `expenses.source` already had a 'bank_feed' value reserved for this
-- exact phase since migration 087 -- this migration adds the tables
-- that actually drive it, plus the two columns on `expenses` a sync run
-- needs: `plaid_transaction_id` (idempotency -- a real unique ID Plaid
-- assigns per transaction, far more reliable than the QuickBooks
-- importer's date+amount+category+vendor heuristic) and
-- `bank_account_id` (which linked account a transaction came from, for
-- when more than one gets connected later).
--
-- Token storage mirrors the existing `jobber_tokens` table (see
-- lib/jobber.ts) -- a live OAuth-style secret in a plain column, read
-- only through the server-side service-role client, never sent to the
-- browser. Same trust boundary this app already relies on for Jobber;
-- no new security posture invented for Plaid.
create table if not exists bank_connections (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'plaid',
  plaid_item_id text not null unique,
  plaid_access_token text not null,
  institution_name text,
  institution_id text,
  status text not null default 'active'
    check (status in ('active', 'error', 'disconnected')),
  -- The transactions/sync cursor -- lets every sync run pick up exactly
  -- where the last one left off instead of re-fetching everything.
  cursor text,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists bank_accounts (
  id uuid primary key default gen_random_uuid(),
  bank_connection_id uuid not null references bank_connections(id) on delete cascade,
  plaid_account_id text not null unique,
  name text,
  mask text,
  subtype text,
  created_at timestamptz not null default now()
);

create index if not exists bank_accounts_connection_idx
  on bank_accounts (bank_connection_id);

alter table expenses
  add column if not exists plaid_transaction_id text unique,
  add column if not exists bank_account_id uuid references bank_accounts(id) on delete set null;

create index if not exists expenses_plaid_transaction_id_idx
  on expenses (plaid_transaction_id);

create index if not exists expenses_bank_account_id_idx
  on expenses (bank_account_id);
