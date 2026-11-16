-- Messages: "needs reply" tracking and saved replies.
--
-- A conversation needs a reply when the customer wrote last and nobody on
-- staff has answered. Staff answering (an email, a text, a logged call)
-- already shows in contact_history; this table only records the "no reply
-- needed" button, for messages like "thanks!".
create table if not exists message_threads_handled (
  jobber_client_id text primary key references customers(jobber_client_id) on delete cascade,
  handled_at timestamptz not null default now(),
  handled_by_name text
);

-- Texts staff type again and again, saved from the reply box. The text
-- {first_name} is swapped for the customer's first name when a reply is
-- inserted. Starts empty.
create table if not exists saved_replies (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  created_by_name text,
  created_at timestamptz not null default now()
);
