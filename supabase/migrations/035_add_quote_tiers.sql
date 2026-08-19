-- Good/Better/Best tiered pricing for native quotes (013_add_quotes.sql).
-- A quote is either flat-price (the original v1 behavior — one
-- price_total, one description) or tiered (2-3 named options, each with
-- its own price and feature list), never both. quotes.pricing_mode picks
-- which; quote_tiers only has rows for tiered quotes.
--
-- Deliberately reuses quotes.price_total/description for the downstream
-- Jobber job-conversion flow (lib/quoteJobConversion.ts) instead of
-- teaching that file about tiers: once a customer accepts a specific
-- tier, this app copies that tier's price onto quotes.price_total (and
-- records which tier via selected_tier_id) so job creation, the quotes
-- list totals, and the internal detail page all keep working unmodified
-- for both flat and tiered quotes. Until accepted, a tiered quote's
-- price_total is null — there's no single price yet, only options — so
-- the existing "not null" constraint has to go.
--
-- Run this once in the Supabase SQL editor (Project vasskxstyvshfiwgpuxj
-- -> SQL Editor).

alter table quotes
  add column if not exists pricing_mode text not null default 'flat' check (
    pricing_mode in ('flat', 'tiered')
  );

alter table quotes alter column price_total drop not null;

create table if not exists quote_tiers (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references quotes(id) on delete cascade,

  -- Fixed set matching the good/better/best pattern rather than a
  -- freeform slot — keeps display order and "which tier did they pick"
  -- logic simple. name is still editable per quote (defaults to
  -- Good/Better/Best but staff can relabel, e.g. "Standard/Premium").
  tier_key text not null check (tier_key in ('good', 'better', 'best')),
  name text not null,
  price numeric(10, 2) not null check (price >= 0),
  features text[] not null default '{}',

  -- Highlights one tier on the public page (e.g. "Most Popular") the
  -- same way the good/better/best mockup did — purely cosmetic, doesn't
  -- affect acceptance logic.
  is_featured boolean not null default false,
  display_order int not null default 0,

  created_at timestamptz not null default now()
);

create unique index if not exists quote_tiers_quote_tier_key_idx
  on quote_tiers (quote_id, tier_key);
create index if not exists quote_tiers_quote_id_idx
  on quote_tiers (quote_id);

-- Records which tier the customer actually accepted, once they have.
-- Set null (not cascade) so a quote survives if a tier row is ever
-- removed — shouldn't normally happen post-acceptance, but a quote
-- shouldn't become undeletable/uneditable over a dangling reference.
alter table quotes
  add column if not exists selected_tier_id uuid references quote_tiers(id) on delete set null;
