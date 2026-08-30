-- Stable public pay link for invoices (Tier 1, pre-Stage-7 gap fix).
--
-- Two problems this solves:
--   1. The Pay Now link sent to customers was a raw Stripe Checkout
--      Session URL, which expires ~24h after creation -- fine for
--      "click it right now" but not for a text/email someone opens two
--      days later.
--   2. There was no way to text an invoice at all (no email fallback
--      for phone-only customers).
--
-- The fix: a stable, unguessable link (/pay/[public_token]) that shows
-- the invoice and mints a *fresh* Checkout Session only when the
-- customer actually clicks Pay Now, instead of embedding a session URL
-- that can go stale before anyone opens it. Same unguessable-token
-- trust model as quotes.public_token (013_add_quotes.sql) -- deliberately
-- not the invoice's id/invoice_number, so neither is exposed in a link
-- that might get forwarded around.
--
-- Nullable (not backfilled) -- existing test invoices created before
-- this migration simply don't have a public link, which is fine, they
-- were never sent to a real customer via one anyway. Every invoice
-- created going forward gets one from lib/invoices.ts's createInvoice().
alter table invoices add column if not exists public_token text;

create unique index if not exists invoices_public_token_idx
  on invoices (public_token);
