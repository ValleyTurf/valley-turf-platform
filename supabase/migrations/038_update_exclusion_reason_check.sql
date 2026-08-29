-- Fixes a production crash: customer_intelligence_exclusions has a
-- CHECK constraint on `reason` (customer_intelligence_exclusions_reason_check)
-- that was never captured in a tracked migration -- like the table
-- itself before 037_add_reactivation_dispositions.sql, it was added by
-- hand directly in Supabase at some point, locked to the OLD reason
-- vocabulary (moved, canceled_permanently, no_longer_has_turf,
-- do_not_contact, bad_fit, dog_passed_away, other).
--
-- lib/deactivation.ts's CHURN_REASONS -- shared by both the
-- Reactivation Pipeline's "Save" dropdown and the new Deactivation
-- section's dropdown -- replaced that list with a unified one that
-- drops "canceled_permanently" and adds "price", "service_issues",
-- "switched_providers", and "unresponsive". Saving any of those new
-- values hit the stale constraint and threw
-- "new row ... violates check constraint customer_intelligence_exclusions_reason_check",
-- which crashed the whole /customers/intelligence Server Component.
--
-- This drops the old constraint and replaces it with one matching
-- CHURN_REASONS, plus 'canceled_permanently' kept as a still-valid
-- legacy value (no longer offered in either dropdown, but any row
-- already saved with it before this migration must keep passing
-- validation -- ALTER TABLE ... ADD CONSTRAINT validates every
-- existing row). New saves are still fully constrained by
-- isChurnReason in lib/deactivation.ts, which no longer accepts it, so
-- this can't be picked again going forward.
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
      'do_not_contact',
      'bad_fit',
      'dog_passed_away',
      'unresponsive',
      'canceled_permanently',
      'other'
    )
  );
