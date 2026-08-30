-- Adds "seasonal" and "not_a_cancel" to CHURN_REASONS
-- (lib/deactivation.ts). Same class of fix as 038/039 -- keeping the
-- customer_intelligence_exclusions_reason_check constraint in sync
-- with CHURN_REASONS every time that list changes, so a new reason
-- value doesn't crash the page the way it did before those two
-- migrations landed.
alter table customer_intelligence_exclusions
  drop constraint if exists customer_intelligence_exclusions_reason_check;

alter table customer_intelligence_exclusions
  add constraint customer_intelligence_exclusions_reason_check
  check (
    reason is null
    or reason in (
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
