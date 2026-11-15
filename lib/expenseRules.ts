// Database half of bank feed category rules (ROADMAP "Top 10 (November
// 2026)" #6, migration 107). The matching itself is pure and lives in
// lib/expenseRuleMatching.ts.
//
// Where rules come from: the "Remember this for future transactions"
// box on any expense's edit form (app/(platform)/expenses/actions.ts's
// updateExpense). Where they're used: the bank feed sync
// (app/api/plaid/sync/route.ts) applies them to every new transaction,
// and saving a rule also applies it right away to matching rows still
// waiting in Needs Review -- never to a row a person has already
// reviewed.
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
import {
  EXPENSE_CATEGORIES,
  LEDGER_TYPES,
  type ExpenseCategory,
  type LedgerType,
} from "@/app/(platform)/expenses/constants";
import {
  MIN_RULE_TEXT_LENGTH,
  normalizeRuleText,
  ruleMatches,
  type CategoryRule,
  type RuleDirection,
} from "@/lib/expenseRuleMatching";

const VALID_CATEGORIES = new Set<string>(EXPENSE_CATEGORIES.map((c) => c.value));
const VALID_LEDGER_TYPES = new Set<string>(LEDGER_TYPES.map((t) => t.value));

// Same two categories app/(platform)/expenses/actions.ts excludes from
// carrying a job-costing treatment.
const JOB_COSTING_EXCLUDED = new Set<string>(["cost_of_service", "payroll"]);

type RuleRow = {
  id: string;
  match_text: string;
  direction: RuleDirection;
  category: string | null;
  ledger_type: string | null;
  job_costing_treatment: string | null;
  enabled: boolean;
  times_applied: number;
  last_applied_at: string | null;
  created_by_name: string | null;
  created_at: string;
};

const RULE_COLUMNS =
  "id, match_text, direction, category, ledger_type, job_costing_treatment, enabled, times_applied, last_applied_at, created_by_name, created_at";

function toRule(row: RuleRow): CategoryRule {
  return {
    id: row.id,
    matchText: row.match_text,
    direction: row.direction,
    category: row.category,
    ledgerType: row.ledger_type,
    jobCostingTreatment: row.job_costing_treatment,
  };
}

// An error here (including "migration 107 hasn't been run") means "no
// rules" -- the sync then behaves exactly as it did before rules
// existed, rather than failing.
export async function loadEnabledRules(): Promise<CategoryRule[]> {
  const { data, error } = await supabaseServer
    .from("expense_category_rules")
    .select(RULE_COLUMNS)
    .eq("enabled", true);

  if (error) {
    console.error("Couldn't load expense category rules:", error.message);
    return [];
  }

  return ((data ?? []) as RuleRow[]).map(toRule);
}

export type RuleListItem = CategoryRule & {
  timesApplied: number;
  lastAppliedAt: string | null;
  createdByName: string | null;
};

export async function listRules(): Promise<RuleListItem[]> {
  const { data, error } = await supabaseServer
    .from("expense_category_rules")
    .select(RULE_COLUMNS)
    .order("match_text", { ascending: true });

  if (error) {
    console.error("Couldn't list expense category rules:", error.message);
    return [];
  }

  return ((data ?? []) as RuleRow[]).map((row) => ({
    ...toRule(row),
    timesApplied: row.times_applied,
    lastAppliedAt: row.last_applied_at,
    createdByName: row.created_by_name,
  }));
}

// The columns a rule sets on an expenses row. Mirrors the constraints
// on that table: a journal entry (ledger_type) carries the placeholder
// category "other" and never a job-costing treatment; a real expense
// carries no ledger_type. Only "one_time" job costing can come from a
// rule -- "amortized" needs an end date chosen per expense.
export type RuleOutcome = {
  category: ExpenseCategory;
  ledger_type: LedgerType | null;
  job_costing_treatment: "one_time" | null;
};

export function outcomeOfRule(rule: CategoryRule): RuleOutcome | null {
  if (rule.ledgerType && VALID_LEDGER_TYPES.has(rule.ledgerType)) {
    return {
      category: "other",
      ledger_type: rule.ledgerType as LedgerType,
      job_costing_treatment: null,
    };
  }

  if (rule.category && VALID_CATEGORIES.has(rule.category)) {
    return {
      category: rule.category as ExpenseCategory,
      ledger_type: null,
      job_costing_treatment:
        rule.jobCostingTreatment === "one_time" && !JOB_COSTING_EXCLUDED.has(rule.category)
          ? "one_time"
          : null,
    };
  }

  // A rule pointing at a category/type that no longer exists does
  // nothing rather than writing a value the table would reject.
  return null;
}

export async function recordRuleUse(countsByRuleId: Map<string, number>): Promise<void> {
  for (const [ruleId, count] of countsByRuleId) {
    if (count <= 0) continue;

    const { data } = await supabaseServer
      .from("expense_category_rules")
      .select("times_applied")
      .eq("id", ruleId)
      .maybeSingle();

    await supabaseServer
      .from("expense_category_rules")
      .update({
        times_applied: ((data?.times_applied as number | undefined) ?? 0) + count,
        last_applied_at: new Date().toISOString(),
      })
      .eq("id", ruleId);
  }
}

export type SaveRuleResult =
  | { ok: true; rule: CategoryRule; appliedToExisting: number }
  | { ok: false; error: string };

// Creates the rule, or updates the existing one for the same text and
// direction (so re-teaching a vendor replaces the old answer instead of
// leaving two rules to argue), then applies it to matching bank-feed
// rows that are still in Needs Review and that nobody has reviewed.
export async function saveRule(params: {
  matchText: string;
  direction: RuleDirection;
  category: string | null;
  ledgerType: string | null;
  jobCostingTreatment: string | null;
  createdByName: string | null;
  // The expense the rule was taught from -- already saved by the caller,
  // so it's left out of "applied to N others".
  excludeExpenseId?: string;
}): Promise<SaveRuleResult> {
  const matchText = normalizeRuleText(params.matchText);

  if (matchText.length < MIN_RULE_TEXT_LENGTH) {
    return {
      ok: false,
      error: `The text to match needs at least ${MIN_RULE_TEXT_LENGTH} characters.`,
    };
  }

  const draft: CategoryRule = {
    id: "",
    matchText,
    direction: params.direction,
    category: params.ledgerType ? null : params.category,
    ledgerType: params.ledgerType,
    jobCostingTreatment: params.ledgerType ? null : params.jobCostingTreatment,
  };

  const outcome = outcomeOfRule(draft);

  if (!outcome) {
    return { ok: false, error: "Pick a category or entry type for the rule." };
  }

  const { data, error } = await supabaseServer
    .from("expense_category_rules")
    .upsert(
      {
        match_text: matchText,
        direction: draft.direction,
        category: draft.category,
        ledger_type: draft.ledgerType,
        job_costing_treatment: outcome.job_costing_treatment,
        enabled: true,
        created_by_name: params.createdByName,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "match_text,direction" }
    )
    .select(RULE_COLUMNS)
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Couldn't save the rule." };
  }

  const rule = toRule(data as RuleRow);

  // Apply to what's already waiting. Only bank-feed rows nobody has
  // touched: a row a person reviewed keeps that person's answer.
  const { data: candidates, error: candidatesError } = await supabaseServer
    .from("expenses")
    .select("id, vendor, description, amount")
    .eq("source", "bank_feed")
    .eq("status", "needs_review")
    .eq("staff_reviewed", false)
    .limit(1000);

  if (candidatesError) {
    console.error("Couldn't load rows to apply the new rule to:", candidatesError.message);
    return { ok: true, rule, appliedToExisting: 0 };
  }

  const matchingIds = (candidates ?? [])
    .filter(
      (row) =>
        row.id !== params.excludeExpenseId &&
        ruleMatches(rule, {
          vendor: row.vendor as string | null,
          description: row.description as string | null,
          amount: Number(row.amount),
        })
    )
    .map((row) => row.id as string);

  if (matchingIds.length === 0) {
    return { ok: true, rule, appliedToExisting: 0 };
  }

  const { error: updateError } = await supabaseServer
    .from("expenses")
    .update({
      category: outcome.category,
      ledger_type: outcome.ledger_type,
      job_costing_treatment: outcome.job_costing_treatment,
      amortization_end_date: null,
      status: "categorized",
      updated_at: new Date().toISOString(),
    })
    .in("id", matchingIds);

  if (updateError) {
    console.error("Couldn't apply the new rule to existing rows:", updateError.message);
    return { ok: true, rule, appliedToExisting: 0 };
  }

  await recordRuleUse(new Map([[rule.id, matchingIds.length]]));

  return { ok: true, rule, appliedToExisting: matchingIds.length };
}

export async function deleteRule(id: string): Promise<{ error: string | null }> {
  const { error } = await supabaseServer.from("expense_category_rules").delete().eq("id", id);
  return { error: error?.message ?? null };
}
