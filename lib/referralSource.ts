// Shared source of truth for the "how did you hear about us?" field on
// the customer record (migration 070_add_customer_referral_source.sql).
// Used by both the New Customer form and the existing-customer Property
// Profile edit (app/components/ReferralSourceField.tsx renders these
// options in both places), plus the two server actions that write them
// (app/(platform)/customers/new/actions.ts,
// app/(platform)/customers/[id]/actions.ts) and the referral report
// (app/(platform)/reports/referrals/page.tsx).
//
// Same shape as RECURRENCE_VALUES/isRecurrenceFrequency in
// app/(platform)/jobs/actions.ts -- a plain string union plus a runtime
// guard, not a DB enum type, so adding an option later is a one-line
// change here plus a migration touching the check constraint (see
// migration 069's header comment for that exact pattern).
export type ReferralSource =
  | "referral"
  | "google"
  | "instagram"
  | "facebook"
  | "word_of_mouth"
  | "qr_code"
  | "other";

// Ryan's exact list (2026-09-11) -- "Yard Sign" deliberately excluded,
// on his call, in favor of tracking any physical QR code (including one
// on a yard sign) through the existing campaigns/QR system instead of a
// duplicate static option.
export const REFERRAL_SOURCE_OPTIONS: { value: ReferralSource; label: string }[] = [
  { value: "referral", label: "Referral" },
  { value: "google", label: "Google" },
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "word_of_mouth", label: "Word of Mouth" },
  { value: "qr_code", label: "QR Code" },
  { value: "other", label: "Other" },
];

const REFERRAL_SOURCE_VALUES = REFERRAL_SOURCE_OPTIONS.map((o) => o.value);

export function isReferralSource(value: string | null): value is ReferralSource {
  return value !== null && (REFERRAL_SOURCE_VALUES as string[]).includes(value);
}

export function referralSourceLabel(value: string | null): string {
  return REFERRAL_SOURCE_OPTIONS.find((o) => o.value === value)?.label ?? "Not set";
}
