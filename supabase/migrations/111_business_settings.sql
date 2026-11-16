-- Business details that used to be typed into the code (name, phone,
-- website, the first name that signs quote messages). One row, id = 1.
-- Customer texts, emails and invoice PDFs read these, so changing them is
-- a Settings edit instead of a code change, and the app could be pointed
-- at a second business later. The code keeps built-in defaults for when
-- this row is missing.
create table if not exists business_settings (
  id integer primary key check (id = 1),
  business_name text not null,
  -- Ten digits, no punctuation. Shown as 480-331-4596 and (480) 331-4596.
  phone_digits text not null check (phone_digits ~ '^[0-9]{10}$'),
  website text not null,
  -- Signs quote messages ("Thank You, Ryan").
  owner_first_name text not null,
  updated_at timestamptz not null default now(),
  updated_by_name text
);

insert into business_settings (id, business_name, phone_digits, website, owner_first_name)
values (1, 'Valley Turf Revival', '4803314596', 'valleyturfrevival.com', 'Ryan')
on conflict (id) do nothing;
