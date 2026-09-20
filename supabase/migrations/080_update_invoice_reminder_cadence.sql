-- Ryan (2026-09-20): change the overdue invoice reminder cadence from
-- 3/10 days (063_add_invoice_reminders_and_quote_followups.sql's
-- original defaults) to 2/5/7 days. The open-ended "then every day after
-- that until paid" part of the request isn't a rules-table change at all
-- -- lib/invoiceReminders.ts's sendDueInvoiceReminders() now has a second
-- phase that reminds daily once an invoice is more overdue than whichever
-- enabled rule's days_after is largest, so raising/lowering that 7 here
-- also moves where the daily tail kicks in, with no code change needed.
--
-- Updates the two existing rows in place (rather than deleting and
-- re-inserting) so their ids -- and any history tied to them -- are
-- undisturbed; each update is scoped to the specific old value so this
-- stays safely rerunnable and won't stomp on a value Ryan's already
-- changed by hand from Settings > Notifications since this was written.
update invoice_reminder_rules
  set days_after = 2, updated_at = now()
  where days_after = 3;

update invoice_reminder_rules
  set days_after = 5, updated_at = now()
  where days_after = 10;

insert into invoice_reminder_rules (days_after, enabled)
values (7, true)
on conflict (days_after) do nothing;
