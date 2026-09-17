-- Extra property addresses per customer, beyond the single address this
-- app already tracks (customers.address_line_1... for a native
-- customer, or a Jobber-sourced customer's synced clientProperties +
-- current_property_id override, migration 052). Same "Add Contact"
-- pattern as migration 060/customer_contacts -- Ryan's request: some
-- customers have a second property (a rental, a vacation home, a
-- previous address) that isn't a separate property in Jobber, and staff
-- had nowhere to put it.
--
-- Reference-only, exactly like customer_contacts: does NOT feed
-- navigation/directions (My Day's get-directions links still come from
-- customers.latitude/longitude, set by address validation against
-- whichever address is actually "current") and is never synced to
-- Jobber. Just a place to keep a second address on file and see it on
-- the Customer page, next to the primary one.
create table if not exists customer_addresses (
  id uuid primary key default gen_random_uuid(),
  -- Same nullable + ON DELETE SET NULL convention as customer_contacts.
  jobber_client_id text references customers(jobber_client_id) on delete set null,
  -- Short label so staff can tell entries apart at a glance, e.g.
  -- "Rental Property", "Billing Address", "Previous Address". Not a
  -- controlled vocabulary -- just a display string, same as
  -- customer_contacts.label.
  label text,
  address_line_1 text not null,
  address_line_2 text,
  city text,
  state text,
  postal_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_addresses_client_idx
  on customer_addresses (jobber_client_id);
