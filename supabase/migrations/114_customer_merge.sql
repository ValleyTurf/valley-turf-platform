-- Duplicate customer merge (migration 114).
--
-- merge_customers(keep, drop, actor) moves everything that points at the
-- duplicate onto the customer being kept, fills any blank details on the
-- kept customer from the duplicate, records the merge, and removes the
-- duplicate. All in one transaction: if anything fails nothing changes.

create table if not exists customer_merges (
  id uuid primary key default gen_random_uuid(),
  kept_client_id text not null,
  dropped_client_id text not null,
  kept_name text,
  dropped_name text,
  -- Full copy of the removed customer row, so nothing is ever lost.
  dropped_customer jsonb not null,
  -- {table_name: rows moved}
  moved jsonb not null default '{}'::jsonb,
  -- Tables where the duplicate's row clashed with the kept customer's
  -- row (one-per-customer data) and was left out.
  dropped_rows jsonb not null default '[]'::jsonb,
  merged_by text,
  merged_at timestamptz not null default now()
);

-- Old customer id -> the customer it was merged into, so a late Jobber
-- sync or webhook for the old id lands on the right customer.
create table if not exists customer_aliases (
  old_client_id text primary key,
  kept_client_id text not null,
  merged_at timestamptz not null default now()
);

-- Pairs staff marked "not the same customer".
create table if not exists customer_duplicate_dismissals (
  pair_key text primary key,
  dismissed_by text,
  dismissed_at timestamptz not null default now()
);

create or replace function merge_customers(p_keep text, p_drop text, p_actor text)
returns jsonb
language plpgsql
as $$
declare
  keep_row customers%rowtype;
  drop_row customers%rowtype;
  t record;
  moved jsonb := '{}'::jsonb;
  dropped jsonb := '[]'::jsonb;
  n integer;
  keep_has_address boolean;
begin
  if p_keep is null or p_drop is null or p_keep = p_drop then
    raise exception 'Pick two different customers.';
  end if;

  select * into keep_row from customers where jobber_client_id = p_keep for update;
  if not found then
    raise exception 'The customer to keep was not found.';
  end if;

  select * into drop_row from customers where jobber_client_id = p_drop for update;
  if not found then
    raise exception 'The customer to merge away was not found.';
  end if;

  keep_has_address := nullif(trim(coalesce(keep_row.address_line_1, '')), '') is not null;

  -- Fill blanks on the kept customer; never overwrite what it has.
  update customers set
    company_name = coalesce(nullif(trim(coalesce(keep_row.company_name, '')), ''), drop_row.company_name),
    email = coalesce(nullif(trim(coalesce(keep_row.email, '')), ''), drop_row.email),
    phone = coalesce(nullif(trim(coalesce(keep_row.phone, '')), ''), drop_row.phone),
    address_line_1 = case when keep_has_address then keep_row.address_line_1 else drop_row.address_line_1 end,
    address_line_2 = case when keep_has_address then keep_row.address_line_2 else drop_row.address_line_2 end,
    city = case when keep_has_address then keep_row.city else drop_row.city end,
    state = case when keep_has_address then keep_row.state else drop_row.state end,
    postal_code = case when keep_has_address then keep_row.postal_code else drop_row.postal_code end,
    notes = case
      when nullif(trim(coalesce(drop_row.notes, '')), '') is null then keep_row.notes
      when nullif(trim(coalesce(keep_row.notes, '')), '') is null then drop_row.notes
      else keep_row.notes || E'\n\n[Merged from ' || coalesce(drop_row.full_name, 'duplicate') || '] ' || drop_row.notes
    end,
    -- If either record opted out of messages, the merged one stays opted out.
    notifications_opted_out =
      coalesce(keep_row.notifications_opted_out, false) or coalesce(drop_row.notifications_opted_out, false)
  where jobber_client_id = p_keep;

  -- Keep the duplicate's own email and phone as extra contacts when they
  -- differ from what the kept customer ends up with.
  if nullif(trim(coalesce(drop_row.email, '')), '') is not null
     and lower(trim(drop_row.email)) is distinct from lower(trim(coalesce(keep_row.email, ''))) then
    insert into customer_contacts (jobber_client_id, label, contact_name, email)
    values (p_keep, 'From merged customer', drop_row.full_name, trim(drop_row.email));
  end if;

  if nullif(trim(coalesce(drop_row.phone, '')), '') is not null
     and regexp_replace(drop_row.phone, '\D', '', 'g') is distinct from regexp_replace(coalesce(keep_row.phone, ''), '\D', '', 'g') then
    insert into customer_contacts (jobber_client_id, label, contact_name, phone)
    values (p_keep, 'From merged customer', drop_row.full_name, trim(drop_row.phone));
  end if;

  -- Move every row that points at the duplicate. Any table with a
  -- jobber_client_id column is covered, including ones added later.
  for t in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables tb
      on tb.table_schema = c.table_schema and tb.table_name = c.table_name
    where c.table_schema = 'public'
      and c.column_name = 'jobber_client_id'
      and c.table_name <> 'customers'
      and tb.table_type = 'BASE TABLE'
  loop
    begin
      execute format('update %I set jobber_client_id = $1 where jobber_client_id = $2', t.table_name)
        using p_keep, p_drop;
      get diagnostics n = row_count;
      if n > 0 then
        moved := moved || jsonb_build_object(t.table_name, n);
      end if;
    exception when unique_violation then
      -- One-per-customer table where both customers had a row: the kept
      -- customer's row wins and the duplicate's is left out (it is
      -- preserved in dropped_rows).
      execute format('select count(*) from %I where jobber_client_id = $1', t.table_name)
        into n using p_drop;
      execute format('delete from %I where jobber_client_id = $1', t.table_name) using p_drop;
      dropped := dropped || jsonb_build_object('table', t.table_name, 'rows', n);
    end;
  end loop;

  -- Referrals: anyone referred by the duplicate is now referred by the
  -- kept customer.
  for t in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables tb
      on tb.table_schema = c.table_schema and tb.table_name = c.table_name
    where c.table_schema = 'public'
      and c.column_name = 'referred_by_customer_id'
      and tb.table_type = 'BASE TABLE'
  loop
    execute format('update %I set referred_by_customer_id = $1 where referred_by_customer_id = $2', t.table_name)
      using p_keep, p_drop;
  end loop;

  -- A customer cannot be referred by themself.
  update customers set referred_by_customer_id = null
  where jobber_client_id = p_keep and referred_by_customer_id = p_keep;

  insert into customer_merges
    (kept_client_id, dropped_client_id, kept_name, dropped_name, dropped_customer, moved, dropped_rows, merged_by)
  values
    (p_keep, p_drop, keep_row.full_name, drop_row.full_name, to_jsonb(drop_row), moved, dropped, p_actor);

  -- Anything that had been merged into the duplicate now points at the
  -- kept customer too.
  update customer_aliases set kept_client_id = p_keep where kept_client_id = p_drop;

  insert into customer_aliases (old_client_id, kept_client_id)
  values (p_drop, p_keep)
  on conflict (old_client_id) do update set kept_client_id = excluded.kept_client_id, merged_at = now();

  delete from customers where jobber_client_id = p_drop;

  return jsonb_build_object('moved', moved, 'dropped_rows', dropped);
end;
$$;

-- Only the server (service role) may run a merge; the public API keys
-- must never be able to call it.
revoke all on function merge_customers(text, text, text) from public, anon, authenticated;
grant execute on function merge_customers(text, text, text) to service_role;
