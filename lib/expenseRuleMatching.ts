// Pure matching logic for bank feed category rules (ROADMAP "Top 10
// (November 2026)" #6, migration 107) -- no database in here, so it can
// be checked on its own. lib/expenseRules.ts is the database half.
//
// A rule says: "any bank-feed transaction whose name contains this text
// is <category> (or <journal entry type>)". Names from the bank are
// noisy -- mixed case, doubled spaces, a different reference number on
// the end every month -- so both sides are normalized the same way and
// compared as "contains", and the rule's text is whatever distinctive
// part Ryan chose to keep, not necessarily the whole name.

export type RuleDirection = "any" | "money_out" | "money_in";

export type CategoryRule = {
  id: string;
  matchText: string;
  direction: RuleDirection;
  category: string | null;
  ledgerType: string | null;
  jobCostingTreatment: string | null;
};

// Shortest text allowed in a rule. Anything shorter ("a", "co") would
// match half the bank statement.
export const MIN_RULE_TEXT_LENGTH = 3;

export function normalizeRuleText(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

// Plaid's sign convention, kept as-is in expenses.amount: positive is
// money leaving the account, negative is money coming in.
export function directionOfAmount(amount: number): "money_out" | "money_in" {
  return amount < 0 ? "money_in" : "money_out";
}

export function ruleMatches(
  rule: CategoryRule,
  transaction: { vendor: string | null; description: string | null; amount: number }
): boolean {
  const needle = normalizeRuleText(rule.matchText);

  if (needle.length < MIN_RULE_TEXT_LENGTH) return false;

  if (rule.direction !== "any" && rule.direction !== directionOfAmount(transaction.amount)) {
    return false;
  }

  const haystack = normalizeRuleText(`${transaction.vendor ?? ""} ${transaction.description ?? ""}`);

  return haystack.includes(needle);
}

// When more than one rule matches, the most specific wins: a rule for
// one direction beats an "any" rule, then the longer text beats the
// shorter ("chase mortgage 4471" over "chase").
export function findMatchingRule(
  rules: CategoryRule[],
  transaction: { vendor: string | null; description: string | null; amount: number }
): CategoryRule | null {
  let best: CategoryRule | null = null;

  for (const rule of rules) {
    if (!ruleMatches(rule, transaction)) continue;

    if (!best) {
      best = rule;
      continue;
    }

    const ruleSpecific = rule.direction !== "any";
    const bestSpecific = best.direction !== "any";

    if (ruleSpecific !== bestSpecific) {
      if (ruleSpecific) best = rule;
      continue;
    }

    if (normalizeRuleText(rule.matchText).length > normalizeRuleText(best.matchText).length) {
      best = rule;
    }
  }

  return best;
}
