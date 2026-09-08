-- Tier 4 (Jobber Independence Roadmap) -- native customer identity. Same
-- pattern as migration 054's jobber_jobs/jobber_visits: `source`
-- distinguishes rows that still live in Jobber ('jobber', the default --
-- the entire existing customer base) from rows this app creates itself
-- going forward ('native'). See lib/nativeCustomers.ts for the write path
-- this unlocks -- it reuses lib/nativeJobs.ts's "native-<uuid>" id
-- convention, so jobber_client_id itself needs no schema change across
-- the 13+ tables already keyed on it. A native customer's id just
-- happens to carry that prefix instead of one of Jobber's own opaque
-- base64 ids.
--
-- created_at is added alongside it because the Customer page's header
-- ("Jobber customer since...") reads Jobber's own client.createdAt live
-- -- a native customer has no such thing to read, so this gives it a
-- real answer instead of a blank one.
alter table customers
  add column if not exists source text not null default 'jobber',
  add column if not exists created_at timestamptz not null default now();

create index if not exists customers_source_idx on customers (source);
