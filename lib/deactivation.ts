// Pure helpers for the "Deactivation" section on
// app/(platform)/customers/intelligence — tracking recurring-service
// customers whose regular cadence has gone quiet, and logging why.
// Zero dependency on lib/supabase-server.ts, same reasoning as
// lib/reactivation.ts and lib/permissionRules.ts.

export type CadenceCategory =
  | "monthly"
  | "quarterly"
  | "bimonthly"
  | "semiannual"
  | "other";

// Expected days between visits for each recurring service category —
// matches the categories app/(platform)/recurring-services/page.tsx
// already groups jobs into (Monthly Maintenance, Quarterly Cleaning,
// Bimonthly Cleaning, Semi-Annual Cleaning). "other" covers anything
// that doesn't match one of those labels, or a client whose recurring
// jobs carry no recognizable category at all.
export const CADENCE_INTERVAL_DAYS: Record<CadenceCategory, number> = {
  monthly: 30,
  quarterly: 90,
  bimonthly: 60,
  semiannual: 180,
  other: 90,
};

// Same category detection app/(platform)/recurring-services/page.tsx
// uses for its own grouping (categoryKeyFor) — duplicated here
// deliberately rather than imported, since that page's function is
// page-local, not a shared export, and this is the only other place
// that needs the same mapping.
export function cadenceCategoryFor(
  serviceCategory: string | null
): CadenceCategory {
  switch (serviceCategory) {
    case "Monthly Maintenance":
      return "monthly";
    case "Quarterly Cleaning":
      return "quarterly";
    case "Bimonthly Cleaning":
      return "bimonthly";
    case "Semi-Annual Cleaning":
      return "semiannual";
    default:
      return "other";
  }
}

// A customer whose regular cadence has gone quiet for roughly 2x their
// expected interval with no new invoice is a reasonable "this probably
// got canceled" signal — without flagging someone who's simply
// mid-cycle (a semi-annual customer at day 100 is normal, not
// canceled; a monthly customer at day 65 probably is).
const CADENCE_MULTIPLIER = 2;

export function deactivationThresholdDays(category: CadenceCategory): number {
  return CADENCE_INTERVAL_DAYS[category] * CADENCE_MULTIPLIER;
}

export function isDeactivationCandidate(input: {
  invoiceCount: number;
  daysSinceLastInvoice: number | null;
  isRecurring: boolean;
  cadenceCategory: CadenceCategory;
  isLogged: boolean;
}): boolean {
  if (!input.isRecurring || input.isLogged) return false;
  // Requires at least 2 invoices, not just >0 -- someone with a single
  // invoice that happened to get tagged under a recurring service
  // category was never actually a recurring customer in practice
  // (nothing to have "gone quiet" from), so they don't belong in the
  // Deactivation queue at all, regardless of how long ago that one
  // invoice was.
  if (input.invoiceCount <= 1 || input.daysSinceLastInvoice === null) {
    return false;
  }

  return (
    input.daysSinceLastInvoice >= deactivationThresholdDays(input.cadenceCategory)
  );
}

// Shared by both the Deactivation dropdown (below) and the Reactivation
// Pipeline's "Save" exclusion dropdown on the same page — one list so
// the two contexts always match, per explicit request. "Canceled
// Permanently" was dropped from the old Reactivation-only list since
// it's now redundant with the whole point of logging a specific reason
// here.
export const CHURN_REASONS: { value: string; label: string }[] = [
  { value: "moved", label: "Moved" },
  { value: "no_longer_has_turf", label: "No Longer Has Turf" },
  { value: "price", label: "Price" },
  { value: "service_issues", label: "Service Issues" },
  { value: "switched_providers", label: "Switched Providers" },
  { value: "seasonal", label: "Seasonal" },
  { value: "do_not_contact", label: "Do Not Contact" },
  { value: "bad_fit", label: "Bad Fit" },
  { value: "dog_passed_away", label: "Dog Passed Away" },
  { value: "unresponsive", label: "Unresponsive / No Reason Given" },
  // For dismissing a Deactivation candidate that isn't actually a
  // cancellation -- the cadence-based detection in
  // isDeactivationCandidate is a heuristic (2x a customer's expected
  // interval with no new invoice), and can false-positive on someone
  // who's still an active recurring customer with a longer-than-usual
  // gap. Saving this reason removes them from the "To Review" queue
  // the same as any other reason, without claiming they actually
  // canceled.
  { value: "not_a_cancel", label: "Not a Cancel – Still Active" },
  { value: "other", label: "Other" },
];

export function isChurnReason(value: string): boolean {
  return CHURN_REASONS.some((reason) => reason.value === value);
}

export function churnReasonLabel(value: string): string {
  return (
    CHURN_REASONS.find((reason) => reason.value === value)?.label ?? value
  );
}
