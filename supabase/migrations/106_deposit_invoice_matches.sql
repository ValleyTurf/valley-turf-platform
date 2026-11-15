-- Match bank deposits to invoices (ROADMAP "Top 10 (November 2026)"
-- #5). Customers who pay by Zelle or check show up twice with nothing
-- tying the two together: a deposit in the bank feed (an expenses row
-- with ledger_type 'revenue_deposit') and an invoice someone has to
-- remember to mark paid by hand. This table is that tie.
--
-- One row per (deposit, invoice) pair rather than a single column on
-- either side, because it's genuinely many-to-many in practice: Katie
-- Ray sent one $400 Zelle for two $200 invoices, and a customer can
-- just as easily split one invoice across two payments. amount is how
-- much of that deposit went to that invoice.
--
-- Run this once in the Supabase SQL editor (Project
-- vasskxstyvshfiwgpuxj -> SQL Editor). Safe to re-run.
create table if not exists deposit_invoice_matches (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references expenses(id) on delete cascade,
  invoice_id uuid not null references invoices(id) on delete cascade,
  amount numeric(10, 2) not null,
  created_by_user_id uuid references users(id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now(),
  unique (expense_id, invoice_id)
);

create index if not exists deposit_invoice_matches_invoice_idx
  on deposit_invoice_matches (invoice_id);
