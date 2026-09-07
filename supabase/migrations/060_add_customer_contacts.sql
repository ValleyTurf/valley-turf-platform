-- Extra phone numbers/emails per customer, beyond the single
-- customers.email/customers.phone columns -- which only ever hold the
-- FIRST entry Jobber returns for a client (see sync-customers's
-- client.emails?.[0]?.address / client.phones?.[0]?.number). Jobber
-- itself lets a client have several; this app just never stored more
-- than one. Ryan's request: some customers give a second cell, a
-- spouse's number, or a property manager's contact, and staff had
-- nowhere to put it.
--
-- customers.email/phone are untouched and stay the ones every automated
-- send (invoice email/text, visit reminders, on-my-way, review requests,
-- autopay receipts) uses by default -- that didn't change. Each row here
-- is an ADDITIONAL contact, reference-only for manual outreach unless
-- receives_notifications is explicitly turned on for it -- Ryan's
-- explicit call, not an all-or-nothing switch: staff pick, per contact,
-- whether it should also get the automated messages a primary contact
-- gets, rather than every extra contact getting everything (which would
-- also mean every extra phone number needing its own SMS opt-in to stay
-- Twilio-compliant -- see the request-quote sms_consent work).
create table if not exists customer_contacts (
  id uuid primary key default gen_random_uuid(),
  -- Same nullable + ON DELETE SET NULL convention as contact_history
  -- (migration 056) and every other table keyed off a customer.
  jobber_client_id text references customers(jobber_client_id) on delete set null,
  -- Short label so staff can tell entries apart at a glance, e.g.
  -- "Cell", "Work", "Spouse", "Property Manager". Not a controlled
  -- vocabulary -- just a display string.
  label text,
  -- Only set when this contact is a different person than the customer
  -- themselves (e.g. "Bob Reyes" for a property manager) -- null means
  -- "this is just another way to reach the customer."
  contact_name text,
  email text,
  phone text,
  receives_notifications boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_contacts_has_reach check (email is not null or phone is not null)
);

create index if not exists customer_contacts_client_idx
  on customer_contacts (jobber_client_id);
