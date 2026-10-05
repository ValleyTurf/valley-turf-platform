import type { ExpenseCategory } from "@/app/(platform)/expenses/constants";

// Maps Plaid's Personal Finance Category taxonomy onto this app's own
// expense categories -- same shape and same philosophy as
// lib/quickbooksImport.ts's SECTION_CATEGORY_MAP: an explicit table for
// the handful of detailed categories that map cleanly, and a safe
// `other` + needsReview fallback for everything else.
//
// Plaid's taxonomy (confirmed via Plaid's own docs/support article,
// 2026-10-05) is built for consumer budgeting apps, not a business
// chart of accounts, so most of it doesn't apply here at all (FOOD_AND_DRINK,
// ENTERTAINMENT, TRAVEL, MEDICAL, PERSONAL_CARE, INCOME, TRANSFER_*,
// LOAN_PAYMENTS). Deliberately NOT mapped even though it sounds close:
// GENERAL_SERVICES_OTHER_GENERAL_SERVICES -- Plaid's own description
// lumps "advertising and cloud storage" into that one catch-all bucket,
// which is exactly the software/subscription and marketing spend this
// ledger cares most about getting right, so it falls through to the
// needsReview default rather than being guessed at.
const DETAILED_CATEGORY_MAP: Record<
  string,
  { category: ExpenseCategory; needsReview: boolean }
> = {
  TRANSPORTATION_GAS: { category: "fuel", needsReview: false },
  GENERAL_SERVICES_INSURANCE: { category: "insurance", needsReview: false },
  GENERAL_SERVICES_AUTOMOTIVE: { category: "vehicle", needsReview: false },
  GENERAL_SERVICES_ACCOUNTING_AND_FINANCIAL_PLANNING: {
    category: "professional",
    needsReview: false,
  },
  GENERAL_SERVICES_CONSULTING_AND_LEGAL: {
    category: "professional",
    needsReview: false,
  },
  GENERAL_MERCHANDISE_OFFICE_SUPPLIES: {
    category: "office",
    needsReview: false,
  },
  GENERAL_SERVICES_POSTAGE_AND_SHIPPING: {
    category: "office",
    needsReview: false,
  },
  RENT_AND_UTILITIES_RENT: { category: "rent_utilities", needsReview: false },
  RENT_AND_UTILITIES_GAS_AND_ELECTRICITY: {
    category: "rent_utilities",
    needsReview: false,
  },
  RENT_AND_UTILITIES_INTERNET_AND_CABLE: {
    category: "rent_utilities",
    needsReview: false,
  },
  RENT_AND_UTILITIES_TELEPHONE: {
    category: "rent_utilities",
    needsReview: false,
  },
  RENT_AND_UTILITIES_WATER: { category: "rent_utilities", needsReview: false },
  RENT_AND_UTILITIES_SEWAGE_AND_WASTE_MANAGEMENT: {
    category: "rent_utilities",
    needsReview: false,
  },
  GOVERNMENT_AND_NON_PROFIT_TAX_PAYMENT: {
    category: "taxes_licenses",
    needsReview: false,
  },
  // All BANK_FEES_* detailed values map the same way -- handled by the
  // BANK_FEES primary-category fallback below rather than one entry per
  // detailed subcategory (ATM, insufficient funds, interest, foreign
  // transaction, overdraft, late, cash advance, other).
  LOAN_PAYMENTS_CAR_PAYMENT: {
    // A loan/lease payment, not an operating expense in the usual
    // sense (it's partly principal) -- flagged for a human to decide
    // rather than silently folded into "vehicle" as if it were a repair
    // bill.
    category: "vehicle",
    needsReview: true,
  },
};

// Primary-category fallbacks for when every detailed value under a
// primary rolls up the same way -- avoids one entry per BANK_FEES_*
// subcategory.
const PRIMARY_CATEGORY_MAP: Record<
  string,
  { category: ExpenseCategory; needsReview: boolean }
> = {
  BANK_FEES: { category: "bank_fees", needsReview: false },
};

export function mapPlaidCategory(
  primary: string | null | undefined,
  detailed: string | null | undefined
): { category: ExpenseCategory; needsReview: boolean } {
  if (detailed && DETAILED_CATEGORY_MAP[detailed]) {
    return DETAILED_CATEGORY_MAP[detailed];
  }

  if (primary && PRIMARY_CATEGORY_MAP[primary]) {
    return PRIMARY_CATEGORY_MAP[primary];
  }

  return { category: "other", needsReview: true };
}
