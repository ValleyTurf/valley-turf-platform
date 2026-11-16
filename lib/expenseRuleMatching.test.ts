import { describe, expect, it } from "vitest";
import { directionOfAmount, ruleMatches, findMatchingRule, type RuleDirection, type CategoryRule } from "./expenseRuleMatching";

describe("expenseRuleMatching", () => {
  // Each check reads as one test. The expected value is compared with
  // toEqual, so objects and arrays compare by content.
  function t(name: string, got: unknown, want: unknown) {
    it(name, () => {
      expect(got).toEqual(want);
    });
  }

  const r = (id: string, matchText: string, direction: RuleDirection = "any", extra: Partial<CategoryRule> = {}): CategoryRule => ({ id, matchText, direction, category: "software", ledgerType: null, jobCostingTreatment: null, ...extra });
  const tx = (vendor: string | null, amount: number, description: string | null = null) => ({ vendor, description, amount });
  t("basic contains", ruleMatches(r("1", "Twilio"), tx("TWILIO  INC 8442", 20)), true);
  t("no match", ruleMatches(r("1", "Twilio"), tx("Resend", 20)), false);
  t("matches description", ruleMatches(r("1", "loan 4471"), tx(null, 300, "Online Transfer to LOAN 4471 ref 99")), true);
  t("whitespace collapsed", ruleMatches(r("1", "mountain   america"), tx("Mountain America  CU", 5)), true);
  t("too short never matches", ruleMatches(r("1", "co"), tx("Costco", 5)), false);
  t("direction out blocks money in", ruleMatches(r("1", "loan", "money_out"), tx("Loan refund", -50)), false);
  t("direction in ok", ruleMatches(r("1", "stripe", "money_in"), tx("STRIPE TRANSFER", -500)), true);
  t("zero amount counts as out", directionOfAmount(0), "money_out");
  t("longest wins", findMatchingRule([r("a", "chase"), r("b", "chase mortgage")], tx("CHASE MORTGAGE PMT", 900))?.id, "b");
  t("directional beats any even if shorter", findMatchingRule([r("a", "chase mortgage"), r("b", "chase", "money_out")], tx("CHASE MORTGAGE PMT", 900))?.id, "b");
  t("none", findMatchingRule([r("a", "shell")], tx("Chevron", 40)), null);
  t("empty rules", findMatchingRule([], tx("Chevron", 40)), null);
  t("null vendor+desc", ruleMatches(r("1", "abc"), tx(null, 1)), false);
});
