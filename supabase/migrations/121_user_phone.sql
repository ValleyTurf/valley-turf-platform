-- Each staff member's own cell number, used by "Call" in the CRM: the CRM's
-- business number rings this phone first, then connects to the customer so
-- the customer sees the business number instead of a personal one.
alter table users add column if not exists phone text;
