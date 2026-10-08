-- Ryan (2026-10-08): "I would like to have the pricing at some point in
-- case someone reaches out in the future and we don't have jobber
-- anymore. I want to know what we priced it at?"
--
-- A quote that only ever existed in Jobber (never created through this
-- app's own Quotes tool) has no price anywhere in our own database --
-- the Past Quotes pill on the customer page correctly shows nothing
-- for those today (see app/(platform)/customers/[id]/page.tsx's
-- 2026-10-07 fix, which stopped it showing a false "$0"). This table
-- is a one-time, permanent copy of just the final total Jobber has on
-- file for every quote, independent of whether Jobber access is still
-- around later. Keyed by Jobber's own quote id so a re-run of the
-- backfill (app/api/jobber/backfill-quote-prices/route.ts) is a safe
-- upsert, not a duplicate.
--
-- Deliberately NOT a column added onto quotes/jobber_invoices-style
-- mirror table -- there is no jobber_quotes mirror table in this app
-- (unlike invoices), and the native `quotes` table is shaped for a
-- live, workable quote (public_token, recipient_*, status workflow)
-- that none of these have. A narrow, purpose-built archive avoids
-- pretending these are native quotes anywhere else in the app.
create table if not exists jobber_quote_price_archive (
  jobber_quote_id text primary key,
  quote_number text,
  total numeric(10, 2) not null check (total >= 0),
  captured_at timestamptz not null default now()
);

create index if not exists jobber_quote_price_archive_quote_number_idx
  on jobber_quote_price_archive (quote_number);
