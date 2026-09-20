-- Ryan's ask (2026-09-20): a flat quote should read like a real
-- service breakdown -- "300-500 Sq Ft - Full Cleaning" as a header,
-- then a bulleted "What's Included:" list, plus optional priced add-on
-- line items (e.g. Urine Extraction) that are each a piece of the one
-- displayed total, not an extra charge on top of it.

-- 1. Turf size was only ever used client-side to suggest a price
--    (NewQuoteForm.tsx's own help text said as much: "isn't saved on
--    the quote") -- now it's part of what gets displayed to the
--    customer, so it needs to be persisted on the quote itself rather
--    than re-derived from the customer's (possibly since-changed)
--    profile at render time.
alter table quotes add column if not exists turf_size_range text;

-- 2. What's-included catalog: a bulleted list of items per service.
--    Free-text service_name, same convention as service_pricing
--    (032_add_service_pricing.sql) -- app code matches it
--    case-insensitively before writing (see
--    lib/serviceIncludedItems.ts), reusing whatever casing is already
--    on file, so this never forks into "Full Cleaning" vs
--    "full cleaning" as two separate catalogs.
--
--    Deliberately NOT turf-size-keyed: Ryan's own example lists the
--    same items for "Full Cleaning" regardless of yard size -- only
--    the price changes with size, and service_pricing already covers
--    that.
create table if not exists service_included_items (
  id uuid primary key default gen_random_uuid(),
  service_name text not null,
  item text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists service_included_items_service_idx
  on service_included_items (service_name);

-- Seed Ryan's own example so the feature isn't empty on day one.
insert into service_included_items (service_name, item, sort_order)
select 'Full Cleaning', item, sort_order
from (values
  ('Turf Fluff Up', 0),
  ('Edge Cleaning', 1),
  ('Debris Removal', 2),
  ('Power Broom', 3),
  ('Deodorizing', 4),
  ('Disinfecting', 5),
  ('Pet Infill Replenish (as needed)', 6)
) as seed(item, sort_order)
where not exists (
  select 1 from service_included_items where service_name = 'Full Cleaning'
);

-- 3. Add-on line items on a quote (flat-pricing quotes only, for now --
--    tiered/Good-Better-Best quotes already have their own per-tier
--    "features" bulleted list from 035_add_quote_tiers.sql). Each
--    add-on carries its own price so the customer sees what it costs,
--    but quotes.price_total is NOT the base price plus these -- it's
--    the one whole-service total staff enters (as today), and these
--    rows are the itemized breakdown of what's inside that total. See
--    app/q/[token]/page.tsx for how they're rendered.
create table if not exists quote_addons (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references quotes(id) on delete cascade,
  name text not null,
  price numeric(10,2) not null default 0 check (price >= 0),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists quote_addons_quote_idx
  on quote_addons (quote_id, sort_order);
