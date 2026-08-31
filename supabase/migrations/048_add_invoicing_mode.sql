-- Stage 7 (the real /invoices cutover): Ryan's explicit rollout rule is
-- "push everyone with no card on file in Jobber to native invoicing now;
-- everyone with a card on file stays on Jobber invoicing for now."
--
-- Confirmed via a diagnostic route (app/api/jobber/diagnostic-payment-methods)
-- that Jobber's Job.willClientBeAutomaticallyCharged field, checked on a
-- client's upcoming job, reliably reflects this -- verified true/false
-- against 6 real customers with known card-on-file status.
--
-- This is stored as a saved column rather than checked live on every
-- invoice for two reasons: (1) Ryan asked to review/adjust the list
-- before it drives anything, and (2) a live per-invoice Jobber call adds
-- latency/rate-limit risk to a customer-facing action for no benefit --
-- card-on-file status doesn't change minute to minute.
--
-- invoicing_mode_source tracks where the current value came from so a
-- re-run of the one-time backfill (app/api/jobber/backfill-invoicing-mode)
-- never clobbers a staff override -- same "never overwrite an existing
-- value" idempotency pattern used by the gate-code import.
alter table customers
  add column if not exists native_invoicing_enabled boolean not null default false,
  add column if not exists invoicing_mode_source text;

comment on column customers.native_invoicing_enabled is
  'true = create invoices natively in this app; false = keep using Jobber invoicing (createJobberInvoice). Default false is the safe/current-behavior default until the backfill or a staff member sets it.';

comment on column customers.invoicing_mode_source is
  'How native_invoicing_enabled got its current value: auto_no_card (backfill found no card on file), auto_has_card (backfill found a card on file), or manual (a staff member overrode it on the review page). Null = never evaluated yet. The backfill route only ever touches null/auto_* rows, never manual.';
