-- Customers can have multiple properties in Jobber (e.g. they moved and
-- staff added a new property instead of editing the old one in place).
-- Jobber itself has no concept of a "primary" or "current" property, so
-- our sync has always just grabbed clientProperties(first: 1) and hoped
-- for the best -- which breaks the customer card address and the
-- get-directions link whenever a client has more than one property.
--
-- This adds a manual override: staff pick which property is "current"
-- on the Customer page, we store its Jobber property id here, and the
-- sync (both the webhook path and the full periodic sync) prefers that
-- property's address when present. Null means "no override, keep using
-- the first usable property" -- the existing behavior, unchanged for
-- every customer who only has one property.
alter table customers
  add column if not exists current_property_id text;
