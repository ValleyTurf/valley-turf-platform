-- Manual "Invoiced in Jobber" dismissal for the Create Invoices list.
--
-- Some recurring/monthly-billing customers (confirmed so far: Darcy
-- Wearing, Patricia Bach, Dawn Kamal -- likely more once reviewed) are
-- billed on a schedule where Jobber's own Invoice.visits connection
-- links each invoice back to the WRONG visit. Confirmed via a temporary
-- diagnostic route (app/api/jobber/inspect-invoice, since removed):
-- Wearing's invoice #1232, issued 9/1 and meant to bill her upcoming
-- September cleaning, actually links (in Jobber's own data) to her
-- already-invoiced August 10th visit instead -- a data issue on
-- Jobber's side (confirmed by Ryan), not a bug in this app's sync.
-- lib/jobberWebhookProcessor.ts and app/api/jobber/sync-invoices already
-- correctly mirror whatever Jobber reports for Invoice.visits -- there's
-- nothing this app can infer on its own to catch a visit Jobber itself
-- never links.
--
-- Until these customers are migrated to native invoicing (Stage 7 --
-- customers.native_invoicing_enabled, migration 048), where this app
-- controls the visit-invoice link directly instead of trusting
-- Jobber's, the automatic linking will never clear their current visit
-- off /invoices/create even after it's genuinely been billed and paid
-- in Jobber. This gives staff a manual escape hatch: mark a visit as
-- already invoiced in Jobber so it drops off the list, without this app
-- creating a duplicate invoice and without pretending to know which
-- real Jobber invoice covers it.
--
-- invoice_dismissed_by/_by_name are denormalized onto the visit row
-- (rather than requiring a join back to users) purely so the "Dismissed"
-- review list on /invoices/create can render who/when without an extra
-- query -- the full audit trail still goes through the normal
-- audit_log table via recordAuditLog, same as every other action here.
alter table jobber_visits
  add column if not exists invoice_dismissed_at timestamptz,
  add column if not exists invoice_dismissed_by uuid references users(id),
  add column if not exists invoice_dismissed_by_name text;

comment on column jobber_visits.invoice_dismissed_at is
  'Set when a staff member manually marks this visit "Invoiced in Jobber" on /invoices/create, because Jobber''s own Invoice.visits link is known to be wrong for this customer''s billing pattern. Null jobber_invoice_id + non-null invoice_dismissed_at = deliberately excluded from the Create Invoices list, not actually invoiced by this app. Cleared back to null if a staff member undoes the dismissal.';
