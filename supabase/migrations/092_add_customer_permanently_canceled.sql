-- Ryan (2026-10-11): "I want to find a way to mark as permanently
-- canceled so they don't show on customer map, or any list of
-- customers I pull."
--
-- Deliberately separate from customer_intelligence_exclusions
-- (migration 037) -- that table tracks where a customer sits in the
-- Reactivation/Deactivation outreach workflows (candidate, contacted,
-- excluded-from-that-pipeline), not whether they're a customer at all
-- any more. Courtney Holzberger moving out of state and never needing
-- service again is a property of the customer record itself, so it
-- lives directly on `customers` -- a single flag every list page can
-- filter on with no join, rather than something staff only discover by
-- opening the Reactivation/Intelligence pages.
--
-- `permanently_canceled_at` doubles as the flag (null = still a real
-- customer) and the timestamp. Reuses lib/deactivation.ts's
-- CHURN_REASONS vocabulary for `permanently_canceled_reason` so "Moved"
-- means the same thing everywhere in the app rather than introducing a
-- second, slightly different reason list.
alter table customers
  add column if not exists permanently_canceled_at timestamptz,
  add column if not exists permanently_canceled_reason text;

alter table customers
  drop constraint if exists customers_permanently_canceled_reason_check;

alter table customers
  add constraint customers_permanently_canceled_reason_check
  check (
    permanently_canceled_reason is null
    or permanently_canceled_reason in (
      'moved',
      'no_longer_has_turf',
      'price',
      'service_issues',
      'switched_providers',
      'seasonal',
      'do_not_contact',
      'bad_fit',
      'dog_passed_away',
      'unresponsive',
      'not_a_cancel',
      'canceled_permanently',
      'other'
    )
  );

-- Every list page that shows "all customers" (app/(platform)/customers,
-- app/(platform)/map) filters these out by default -- this index makes
-- that `is permanently_canceled_at null` check on the common path free,
-- same reasoning as the partial indexes in 037.
create index if not exists idx_customers_permanently_canceled_at
  on customers (permanently_canceled_at)
  where permanently_canceled_at is not null;
