-- Loan interest as its own expense (migration 115).
-- Each loan payment row carries a PRINCIPAL/INTEREST split in its
-- description. The principal stays a "Paid to Loan" journal entry; the
-- interest becomes its own expense row, linked back to the payment.
alter table expenses
  add column if not exists loan_interest_for_expense_id uuid
    references expenses(id) on delete cascade;

alter table expenses
  drop constraint if exists expenses_loan_interest_for_expense_id_key;

alter table expenses
  add constraint expenses_loan_interest_for_expense_id_key
  unique (loan_interest_for_expense_id);
