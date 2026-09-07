-- Ryan wants the Bill To section on the invoice PDF to show the
-- customer's address, since some customers have more than one property
-- and the address is what tells them which one this invoice covers.
--
-- Snapshotted onto the invoice at creation time (like customer_name
-- already is) rather than looked up live at PDF-render time -- an
-- invoice should keep showing the address it was actually billed to
-- even if the customer's address (or their current_property_id
-- override, see migration 052) changes later.
--
-- Free-text, newline-separated ("123 Main St\nPhoenix, AZ 85212")
-- rather than separate line/city/state/zip columns -- this is a display
-- snapshot, not a field anything else queries or joins on.
alter table invoices
  add column if not exists service_address text;
