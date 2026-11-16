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

-- Texts staff type again and again. {first_name} is swapped for the
-- customer's first name when a reply is inserted.
create table if not exists saved_replies (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  created_by_name text,
  created_at timestamptz not null default now()
);

-- A few starting points, edit or delete them from the reply box.
insert into saved_replies (title, body)
select title, body from (values
  ('Running late', 'Hi {first_name}, this is Valley Turf Revival. We''re running a little behind today and will be there as soon as we can. Thank you for your patience!'),
  ('Reschedule', 'Hi {first_name}, no problem. What day works better for you? We''ll move your visit and confirm it by text.'),
  ('Got it', 'Hi {first_name}, got your message, thank you! We''ll take care of it.'),
  ('Invoice question', 'Hi {first_name}, thanks for reaching out about your invoice. We''ll look into it and get back to you shortly.')
) as seed(title, body)
where not exists (select 1 from saved_replies);
