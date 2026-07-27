-- Accepted-quote -> Jobber job conversion tracking. When a quote is
-- accepted (public accept link or an internal status change), the app
-- attempts to create a real job in Jobber via their jobCreate GraphQL
-- mutation. These columns record the outcome so the quote detail page can
-- show it and offer a retry — the attempt is deliberately never allowed
-- to block or fail the quote's own "accepted" status, so this is purely
-- informational/retry-support, not part of the quotes status machine.
--
-- Run this once in the Supabase SQL editor (Project vasskxstyvshfiwgpuxj
-- -> SQL Editor).

alter table quotes
  add column if not exists jobber_job_id text,
  add column if not exists jobber_job_number text,
  add column if not exists job_creation_error text,
  add column if not exists job_creation_attempted_at timestamptz;

-- Quotes can be made against a lead who isn't a Jobber client yet (see
-- 013_add_quotes.sql). When their quote is accepted, the app creates them
-- as a real Jobber client automatically (via clientCreate) before
-- creating the job — this records that new client id back on the lead,
-- and the lead's status flips to 'converted' the same way it would if
-- staff had converted them manually.
alter table leads
  add column if not exists jobber_client_id text;
