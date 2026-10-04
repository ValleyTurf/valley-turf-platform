-- Ryan (2026-10-04): "I think Other is too broad still. Should we have a
-- category for Supplies as well as Tools, Equipment and Machinery, then
-- Repairs and Maintenance also. I think you have Office and Supplies the
-- same, they should be split."
--
-- Splits the old "office" (labeled "Office & Supplies") and "other"
-- catch-all into five categories: office, supplies, tools_equipment,
-- repairs_maintenance, and a narrower other. Widens the CHECK constraint
-- 087_add_expenses.sql put on expenses.category, then backfills every
-- row the QuickBooks import (2026-10-04) already wrote into the old,
-- broader categories -- using the original QuickBooks category each row
-- recorded in its own `notes` field (see lib/quickbooksImport.ts) to
-- reclassify it correctly instead of leaving all 53 of those rows
-- sitting in "needs_review" forever. Only rows this migration can
-- resolve with real confidence get their status flipped to
-- "categorized" -- rows that were needs_review for a genuinely
-- different reason (Contract labor, Vehicle insurance) are untouched.

-- Widen the constraint. Looked up by definition rather than by a
-- hardcoded name (expenses_category_check, Postgres' default name for
-- an unnamed inline column check) so this doesn't silently no-op if
-- that assumption is ever wrong.
do $$
declare
  existing_constraint text;
begin
  select con.conname into existing_constraint
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  where rel.relname = 'expenses'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%category%';

  if existing_constraint is not null then
    execute format('alter table expenses drop constraint %I', existing_constraint);
  end if;
end $$;

alter table expenses add constraint expenses_category_check check (
  category in (
    'cost_of_service',
    'fuel',
    'payroll',
    'marketing',
    'software',
    'insurance',
    'vehicle',
    'office',
    'supplies',
    'tools_equipment',
    'repairs_maintenance',
    'professional',
    'bank_fees',
    'rent_utilities',
    'taxes_licenses',
    'other'
  )
);

-- Backfill: reclassify QuickBooks-imported rows that landed in the old
-- "other" bucket, using the original QuickBooks category the import
-- recorded in notes. These splits are unambiguous (QuickBooks already
-- told us which of the three it was), so status moves to "categorized"
-- instead of staying needs_review.
update expenses
set category = 'supplies', status = 'categorized', updated_at = now()
where category = 'other'
  and notes ilike '%Imported from QuickBooks%'
  and notes ilike '%Original QuickBooks category: "Supplies"%';

update expenses
set category = 'tools_equipment', status = 'categorized', updated_at = now()
where category = 'other'
  and notes ilike '%Imported from QuickBooks%'
  and notes ilike '%Original QuickBooks category: "Tools, machinery, & equipment"%';

update expenses
set category = 'repairs_maintenance', status = 'categorized', updated_at = now()
where category = 'other'
  and notes ilike '%Imported from QuickBooks%'
  and notes ilike '%Original QuickBooks category: "Repairs & maintenance"%';
