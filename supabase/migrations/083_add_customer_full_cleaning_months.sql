-- Roadmap item 19: auto-flip Maintenance to Full on the correct months.
-- Ryan already types the Full-cleaning months into each customer's own
-- Service Instructions field (customers.service_instructions), e.g.
-- "Full Cleaning - Mar, June, Sept, Dec" -- this adds a proper
-- structured column to hold the PARSED result of that text, so the
-- recurring-visit generator (lib/nativeJobs.ts's
-- generateUpcomingNativeVisits) can check it directly instead of
-- re-parsing free text on every run.
--
-- Empty array (the default) means "no configured Full months" -- the
-- generator's existing behavior (job's own title, unchanged) applies
-- untouched for every customer until this column is explicitly
-- populated for them. Nothing reads or writes this column yet outside
-- of this migration -- it's being added and populated for exactly one
-- customer (Alyssa Baldriche) as the real first test case before this
-- is rolled out to anyone else, per Ryan's explicit request not to
-- touch other customers' data while this is being built out.
alter table customers
  add column if not exists full_cleaning_months smallint[] not null default '{}';

comment on column customers.full_cleaning_months is
  'Calendar months (1-12) this customer''s recurring visits should be flagged Full instead of the job''s default title. Parsed from service_instructions; empty = not configured, no effect.';
