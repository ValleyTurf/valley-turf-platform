-- Adds Google Address Validation API results to leads, so lead intake can
-- flag addresses that need a follow-up call (missing unit number, typo in
-- street/city, undeliverable address) before a crew is ever scheduled.
-- Populated by app/api/leads/route.ts at intake time via
-- lib/addressValidation.ts, which fails soft (returns null, so every column
-- below stays null) if GOOGLE_ADDRESS_VALIDATION_API_KEY isn't configured or
-- the API call fails — safe to run this migration before that env var
-- exists, and safe to leave the env var unset indefinitely if not needed.
alter table leads
  add column if not exists address_validation_status text,
  add column if not exists address_validated_at timestamptz,
  add column if not exists address_formatted text,
  add column if not exists address_lat double precision,
  add column if not exists address_lng double precision;

alter table leads
  add constraint leads_address_validation_status_check
  check (
    address_validation_status is null
    or address_validation_status in (
      'accept', 'confirm', 'confirm_add_subpremises', 'fix', 'unknown'
    )
  );
