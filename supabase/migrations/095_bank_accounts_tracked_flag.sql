-- Ryan (2026-10-13): Mountain America is his whole family's banking
-- relationship, and Plaid's consent screen for that institution forces
-- "connect everything," with no per-account selection (confirmed by the
-- grayed-out checkboxes he hit in Link). Exchanging the public_token
-- saved all 20 accounts Plaid returned -- his 4 business accounts
-- (Rewards Business Visa Platinum, 2nd Mortgage, PK Checking, Money
-- Market) alongside his kids' and other family accounts -- and the
-- first sync pulled expenses from every one of them.
--
-- This adds the flag app/api/plaid/sync/route.ts now checks before
-- importing a transaction: only an account explicitly marked true here
-- feeds /expenses. Defaults to false so a *new* connection (this one,
-- retroactively, and any future one) starts with nothing tracked until
-- a person deliberately turns an account on in Settings -> Bank Feed --
-- "ask forgiveness" was exactly backwards for a forced all-or-nothing
-- consent grant.
alter table bank_accounts
  add column if not exists include_in_expense_sync boolean not null default false;
