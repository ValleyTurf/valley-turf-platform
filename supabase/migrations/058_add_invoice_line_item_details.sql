-- Ryan's Jobber line items (e.g. "Quarterly Cleaning 1000-1250") carry a
-- description listing the included services as a bullet list (Turf
-- Fluff Up, Debris Removal, Deep Solution Penetration, ...). This column
-- lets that same sub-list live on a native invoice's line item and get
-- rendered under its description on the PDF, instead of getting dropped
-- on the floor when a job's line item is pulled in as an invoice
-- suggestion. Nullable/free-text -- most line items won't have one.
alter table invoice_line_items
  add column if not exists details text;
