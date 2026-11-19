-- Allow the new "interest" expense category and the "loan_interest"
-- source (migration 116).
alter table expenses drop constraint if exists expenses_category_check;

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
    'interest',
    'other'
  )
);

alter table expenses drop constraint if exists expenses_source_check;

alter table expenses add constraint expenses_source_check
  check (source in ('manual', 'bank_feed', 'processing_fee', 'loan_interest'));
