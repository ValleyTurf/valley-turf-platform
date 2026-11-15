-- Bank feed category rules (ROADMAP "Top 10 (November 2026)" #6).
-- Ryan re-categorizes the same vendors and the same loan payment every
-- time they come through the bank feed. A rule remembers the answer:
-- any bank-feed transaction whose vendor/description contains
-- match_text (compared lowercase) gets the rule's category or journal
-- entry type applied automatically on the next sync.
--
-- direction keeps a rule from catching the opposite side of the same
-- name (a payment TO a loan vs. a refund FROM it). category and
-- ledger_type are deliberately plain text with no check constraint --
-- the allowed values already live in expenses' own constraints and in
-- app/(platform)/expenses/constants.ts, and a second copy here would
-- just be one more place to forget when a category is added.
--
-- Run this once in the Supabase SQL editor (Project
-- vasskxstyvshfiwgpuxj -> SQL Editor). Safe to re-run.
create table if not exists expense_category_rules (
  id uuid primary key default gen_random_uuid(),
  match_text text not null,
  direction text not null default 'any'
    check (direction in ('any', 'money_out', 'money_in')),
  -- Exactly one of these two describes what the rule applies: a real
  -- expense category, or a journal entry type (owner draw, loan
  -- payment, internal transfer, ...).
  category text,
  ledger_type text,
  job_costing_treatment text,
  enabled boolean not null default true,
  times_applied integer not null default 0,
  last_applied_at timestamptz,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_text, direction),
  check (category is not null or ledger_type is not null)
);
