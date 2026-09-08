-- Customer portal sign-in can now also happen by text, not just email
-- (app/portal/login -- Ryan's request). A customer found by phone may
-- have no email on file at all, so the token row's email column can no
-- longer be required.
alter table portal_login_tokens
  alter column email drop not null;
