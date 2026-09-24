-- Per-customer notification opt-out. Ryan, 2026-09-24: "Lehi Cove and
-- Hampton Villas do not want to receive any of the notifications, can we
-- turn them off for some customers?"
--
-- One flag per customer, checked by every automated customer-facing send
-- in lib/notifications.ts (isOptedOutOfNotifications) before it goes
-- out -- visit reminders, review requests, quote emails/texts, invoice
-- emails/texts, overdue notices, autopay/manual payment receipts,
-- on-my-way texts, and the portal magic link. Staff-initiated manual
-- emails/texts (sendManualEmail/sendManualSms, the Send Email/Send SMS
-- buttons) and the internal staff alerts elsewhere in that file are
-- deliberately NOT gated by this -- Ryan confirmed staff should still be
-- able to reach an opted-out customer directly when needed.
--
-- Defaults to false so every existing customer keeps getting messages
-- exactly as today; this is toggled per customer from the Property
-- Profile section of the customer page.
alter table customers
  add column if not exists notifications_opted_out boolean not null default false;
