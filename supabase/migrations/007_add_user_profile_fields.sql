-- Start of "employee profiles" on the Team page: pay info living
-- alongside login/role. More fields (phone, hire date, certifications,
-- etc.) can be added the same way as the business needs them.
-- Run this once in the Supabase SQL editor (Project vasskxstyvshfiwgpuxj -> SQL Editor).

alter table users
  add column if not exists hourly_rate numeric(10, 2);
