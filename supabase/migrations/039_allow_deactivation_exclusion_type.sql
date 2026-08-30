-- The actual cause of the ongoing "Customer Intelligence could not be
-- loaded" crash -- 038 fixed the wrong constraint. There are TWO check
-- constraints on customer_intelligence_exclusions, both added by hand
-- outside any tracked migration:
--
--   customer_intelligence_exclusions_reason_check  (fixed in 038)
--   customer_intelligence_exclusions_type_check
--     CHECK (exclusion_type = 'reactivation')
--
-- That second one hard-locks exclusion_type to the single literal
-- value 'reactivation' -- it predates the Deactivation feature
-- entirely, from back when this table only ever recorded Reactivation
-- Pipeline exclusions. Every save from the new Deactivation section
-- (exclusion_type = 'deactivation') was rejected by THIS constraint,
-- before the reason value was ever evaluated -- 038's fix, while
-- correct for the reason column, could never have resolved this.
alter table customer_intelligence_exclusions
  drop constraint if exists customer_intelligence_exclusions_type_check;

alter table customer_intelligence_exclusions
  add constraint customer_intelligence_exclusions_type_check
  check (exclusion_type in ('reactivation', 'deactivation'));
