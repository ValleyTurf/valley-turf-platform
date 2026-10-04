import "server-only";

import { parseCsv } from "@/lib/csv";
import type { ExpenseCategory } from "@/app/(platform)/expenses/constants";

// Parser for QuickBooks Online's "Transaction Detail by Account" export
// (Ryan, 2026-10-04 -- one-time historical import ahead of the native
// bank feed taking over from 10/1/2026 forward).
//
// The report lists every transaction TWICE -- once under the bank/credit
// card account that paid it, and once under the P&L category it was
// coded to -- because QuickBooks is double-entry and this report is
// grouped by account on both sides of each entry. Importing from both
// sides would double every expense, so this only reads rows out of the
// category sections (Insurance, Vehicle gas & fuel, etc.) and ignores
// the bank/credit-card account sections entirely -- the category
// sections already have each real transaction exactly once, with the
// paying account recorded in that row's own Split column for reference.
//
// Verified against Ryan's actual Jan-Sep 2026 export before writing this
// mapping (not guessed): confirmed the "Cash" section mirrors real
// category sections' postings with the sign flipped (same double-entry
// pattern as the named bank accounts, so it's excluded the same way),
// and confirmed "Jobber Payment Fees" posts as QuickBooks "Deposit"-type
// rows even though it's a real cost -- so filtering happens by which
// account section a row lives under, never by QuickBooks' own
// Transaction Type field.

export type ParsedExpenseRow = {
  vendor: string;
  description: string;
  amount: number;
  expenseDate: string; // YYYY-MM-DD
  category: ExpenseCategory;
  needsReview: boolean;
  sourceSection: string;
  sourceSplit: string;
  sourceTransactionType: string;
};

export type SkippedSectionSummary = {
  section: string;
  rowCount: number;
  totalAmount: number;
  reason: string;
};

export type QuickBooksImportResult = {
  rows: ParsedExpenseRow[];
  skippedSections: SkippedSectionSummary[];
  unrecognizedSections: SkippedSectionSummary[];
  parseWarnings: string[];
};

// Section name (as printed by QuickBooks) -> our category + whether the
// mapping is confident enough to mark "categorized" outright vs.
// "needs_review" so Ryan can fix it on the Expenses page afterward.
const SECTION_CATEGORY_MAP: Record<
  string,
  { category: ExpenseCategory; needsReview: boolean }
> = {
  "Accounting fees": { category: "professional", needsReview: false },
  "Advertising & marketing": { category: "marketing", needsReview: false },
  "Bank and credit card fees": { category: "bank_fees", needsReview: false },
  "Building & land rent": { category: "rent_utilities", needsReview: false },
  // 1099 contract labor, not W-2 payroll -- close enough to group with
  // payroll for the P&L's payroll line, but flagged since it's a
  // judgment call, not an exact match.
  "Contract labor": { category: "payroll", needsReview: true },
  "Direct supplies & materials": {
    category: "cost_of_service",
    needsReview: false,
  },
  Insurance: { category: "insurance", needsReview: false },
  "Jobber Payment Fees": { category: "bank_fees", needsReview: false },
  "Office expenses": { category: "office", needsReview: false },
  // Generic "repairs" could be vehicle or equipment -- QuickBooks doesn't
  // say which here (there's a separate, unambiguous "Vehicle repairs").
  "Repairs & maintenance": { category: "other", needsReview: true },
  Rent: { category: "rent_utilities", needsReview: false },
  "Software/Apps": { category: "software", needsReview: false },
  // Generic "Supplies" (distinct from "Direct supplies & materials") --
  // could be job-tied cost_of_service or office/shop supplies.
  Supplies: { category: "other", needsReview: true },
  "Tools, machinery, & equipment": { category: "other", needsReview: true },
  "Vehicle expenses": { category: "vehicle", needsReview: false },
  "Vehicle gas & fuel": { category: "fuel", needsReview: false },
  // Could arguably be "insurance" instead of "vehicle" -- flagged either way.
  "Vehicle insurance": { category: "vehicle", needsReview: true },
  "Vehicle registration": { category: "vehicle", needsReview: false },
  "Vehicle repairs": { category: "vehicle", needsReview: false },
  Utilities: { category: "rent_utilities", needsReview: false },
  Wages: { category: "payroll", needsReview: false },
};

// Sections that are real QuickBooks accounts but aren't P&L expenses --
// bank/credit-card registers (the other side of every double-entry
// posting), balance-sheet/equity accounts, income accounts (revenue
// already comes from Jobber, not QuickBooks), and clearing accounts.
const EXCLUDED_SECTIONS: Record<string, string> = {
  "Accounts receivable": "balance-sheet account, not an expense",
  Cash: "a paying account (same double-entry duplicate as a bank account)",
  "Opening balance equity": "equity, not an expense",
  "Owner draws": "owner equity distribution, not a deductible expense",
  "Undeposited funds": "balance-sheet clearing account",
  "Undistributed Tips": "balance-sheet clearing account",
  "Refunds Clearing": "balance-sheet clearing account",
  "Interest income": "income, not an expense",
  "Other income": "income, not an expense",
  Sales: "income, not an expense",
  Services: "income, not an expense (revenue already comes from Jobber)",
  "Services ( 6 )": "income, not an expense (revenue already comes from Jobber)",
  // Ambiguous direction (vendor credits received vs. discounts given) --
  // skipped rather than guessed; small dollar amount, worth a manual look.
  "Refunds & discounts to customers": "credits/discounts -- direction unclear, review manually in QuickBooks",
};

function isBankOrCardAccountSection(sectionName: string): boolean {
  // These are named per-account section headers (bank/credit card/savings
  // accounts) rather than fixed category names, so matched by pattern
  // instead of an exact list -- e.g. "BUSINESS CHECKING (0050) - 1",
  // "Rewards Business Visa Platinum (0001) - 1".
  return /\(\d+\)\s*-\s*\d+$/.test(sectionName.trim());
}

function parseAmount(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const negative = trimmed.startsWith("-") || /^\(.*\)$/.test(trimmed);
  const cleaned = trimmed.replace(/[(),$-]/g, "").replace(/,/g, "");
  if (!cleaned) return null;
  const value = Number(cleaned);
  if (Number.isNaN(value)) return null;
  return negative ? -value : value;
}

function parseDate(raw: string): string | null {
  const match = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const [, month, day, year] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

export function parseQuickBooksTransactionDetail(
  csvText: string
): QuickBooksImportResult {
  const allRows = parseCsv(csvText);
  const parseWarnings: string[] = [];

  const headerIndex = allRows.findIndex(
    (r) => r.length > 1 && r[1]?.trim() === "Transaction date"
  );

  if (headerIndex === -1) {
    return {
      rows: [],
      skippedSections: [],
      unrecognizedSections: [],
      parseWarnings: [
        "Could not find the expected header row (looking for a 'Transaction date' column). This may not be a QuickBooks 'Transaction Detail by Account' export.",
      ],
    };
  }

  type RawTxn = {
    section: string;
    date: string;
    type: string;
    name: string;
    description: string;
    split: string;
    amount: number;
  };

  const bySection = new Map<string, RawTxn[]>();
  let currentSection: string | null = null;

  for (const r of allRows.slice(headerIndex + 1)) {
    if (r.length < 9) continue;
    const [col0, date, type, , name, description, split, amountRaw] = r;
    const sectionCandidate = col0.trim();
    const dateTrimmed = date.trim();

    if (sectionCandidate && !dateTrimmed) {
      const lower = sectionCandidate.toLowerCase();
      if (
        lower.startsWith("total for") ||
        sectionCandidate === "TOTAL" ||
        lower.startsWith("accrual basis") ||
        lower.startsWith("cash basis")
      ) {
        continue;
      }
      currentSection = sectionCandidate;
      continue;
    }

    if (dateTrimmed && currentSection) {
      const amount = parseAmount(amountRaw);
      const isoDate = parseDate(dateTrimmed);
      if (amount === null || isoDate === null) {
        parseWarnings.push(
          `Skipped an unreadable row under "${currentSection}" (date="${dateTrimmed}", amount="${amountRaw}").`
        );
        continue;
      }
      const list = bySection.get(currentSection) ?? [];
      list.push({
        section: currentSection,
        date: isoDate,
        type: type.trim(),
        name: name.trim(),
        description: description.trim(),
        split: split.trim(),
        amount,
      });
      bySection.set(currentSection, list);
    }
  }

  const rows: ParsedExpenseRow[] = [];
  const skippedSections: SkippedSectionSummary[] = [];
  const unrecognizedSections: SkippedSectionSummary[] = [];

  for (const [section, txns] of bySection.entries()) {
    const totalAmount = txns.reduce((sum, t) => sum + t.amount, 0);

    if (isBankOrCardAccountSection(section)) {
      skippedSections.push({
        section,
        rowCount: txns.length,
        totalAmount,
        reason: "bank/credit card account (same transactions counted under their real category below)",
      });
      continue;
    }

    if (section in EXCLUDED_SECTIONS) {
      skippedSections.push({
        section,
        rowCount: txns.length,
        totalAmount,
        reason: EXCLUDED_SECTIONS[section],
      });
      continue;
    }

    const mapping = SECTION_CATEGORY_MAP[section];
    if (!mapping) {
      unrecognizedSections.push({
        section,
        rowCount: txns.length,
        totalAmount,
        reason: "not in the known category list -- not imported, review manually",
      });
      continue;
    }

    for (const t of txns) {
      rows.push({
        vendor: t.name || "",
        description: t.description,
        // NOT Math.abs() -- a category section can include a negative row
        // (a "Credit Card Credit" refund/return posted to that same
        // category), and QuickBooks' own running Balance column for each
        // section proves the signed sum is the correct net total for
        // that category. Flattening every row to positive was tried and
        // verified wrong against Ryan's real export (inflated the
        // Software/Apps total by exactly the amount of one $250 refund,
        // counted twice instead of netted out).
        amount: t.amount,
        expenseDate: t.date,
        category: mapping.category,
        needsReview: mapping.needsReview,
        sourceSection: section,
        sourceSplit: t.split,
        sourceTransactionType: t.type,
      });
    }
  }

  return { rows, skippedSections, unrecognizedSections, parseWarnings };
}
