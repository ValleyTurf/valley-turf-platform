-- Post-visit satisfaction rating (ROADMAP.md Fresh Ideas #10, Ryan's
-- spec 2026-09-11) -- clickable 1-5 stars added to the review-ask block
-- already sitting at the bottom of every invoice email
-- (lib/notifications.ts's sendInvoiceEmail). A star click hits the new
-- public /rate/[token] page (same public_token invoices already use for
-- /pay/[token]) instead of jumping straight to Google, so the rating
-- itself is what gates the public review ask now -- only a genuine
-- 5-star sends the customer on to leave a real Google review; anything
-- 1-4 stays internal and alerts Ryan instead (lib/notifications.ts's
-- sendLowRatingAlert). This is what makes ROADMAP.md's former #9 (a
-- separate private-feedback funnel) redundant -- the star click IS the
-- gate.
create table if not exists invoice_ratings (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  jobber_client_id text,
  -- Denormalized off the invoice at rating time (same convention as
  -- jobber_visits.customer_name elsewhere) so the daily digest's
  -- "Low ratings" section and the staff alert don't need a join back to
  -- invoices/customers.
  customer_name text,
  invoice_number text,
  score smallint not null check (score between 1 and 5),
  routed_to_google boolean not null default false,
  -- Set the first time the low-rating staff alert is actually sent, so a
  -- customer who corrects their rating on the confirm page before
  -- submitting, or double-clicks Confirm, doesn't trigger a second
  -- text/email to Ryan for the same invoice.
  alerted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (invoice_id)
);

create index if not exists invoice_ratings_client_idx on invoice_ratings (jobber_client_id);
-- Powers the daily digest's "Low invoice ratings (last 24h)" section.
create index if not exists invoice_ratings_created_at_idx on invoice_ratings (created_at);
