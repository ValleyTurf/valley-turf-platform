-- Individual team logins + RBAC, replacing the single shared ADMIN_PASSWORD.
-- Run this once in the Supabase SQL editor (Project vasskxstyvshfiwgpuxj -> SQL Editor).

create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null,
  password_hash text not null,
  role text not null default 'staff' check (role in ('admin', 'staff')),
  active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists users_email_idx on users (lower(email));

-- Seed the first admin account (Ryan). Password hash below corresponds to
-- a randomly generated temporary password — see the chat for the one-time
-- password, and change it via Team > your account once you've logged in.
insert into users (email, name, password_hash, role)
values (
  'ryanbrittgordon@gmail.com',
  'Ryan',
  'a2005b7aeb4ea3d626aa014fadf2f5c5:7b52d5bd2af662d76f4de1359e5'
  || '5036a02c3d4c489ea7ec76575627467c702e569a768afc9d4898492c5689'
  || 'c502c63062c3fc19fe6e556f60de0a65a2daebb6f',
  'admin'
)
on conflict (email) do nothing;
