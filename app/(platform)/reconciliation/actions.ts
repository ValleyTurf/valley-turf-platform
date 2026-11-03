"use server";

// Moved from app/(platform)/settings/bank-feed/actions.ts (Ryan,
// 2026-11-03: "Rather than having this in the settings, should there be
// a Reconciliation report...") -- setting/adjusting the balance anchor
// is part of actually working a reconciliation, not connecting a bank
// account, so it belongs with the report, not Settings.
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/currentUser";
import { supabaseServer } from "@/lib/supabase-server";
import { recordAuditLog } from "@/lib/auditLog";

// Ryan enters the true balance from his bank statement as of a chosen
// date (defaulting to 10/1/2026, the bank feed's own cutover date) once
// per account; from there the in-app balance is computed by running
// every expenses row for that account forward from that anchor (see
// getTrackedAccountsWithBalances in lib/bankReconciliation.ts).
// Re-saving with a later date and a fresh balance is also how Ryan can
// "re-anchor" if the running total ever drifts for a reason that isn't
// a miscategorized transaction (e.g. a transaction from before this
// feed existed).
export async function updateStartingBalance(
  accountId: string,
  formData: FormData
): Promise<void> {
  const actor = await requireAdmin();

  const balanceRaw = formData.get("starting_balance");
  const dateRaw = formData.get("starting_balance_date");

  const balance =
    typeof balanceRaw === "string" && balanceRaw.trim() !== ""
      ? Number(balanceRaw)
      : null;

  if (balance === null || !Number.isFinite(balance)) {
    throw new Error("Starting balance must be a number.");
  }

  const date =
    typeof dateRaw === "string" && dateRaw.trim() !== ""
      ? dateRaw
      : new Date().toISOString().slice(0, 10);

  const { data: before } = await supabaseServer
    .from("bank_accounts")
    .select("name, mask, starting_balance, starting_balance_date")
    .eq("id", accountId)
    .maybeSingle();

  const { error } = await supabaseServer
    .from("bank_accounts")
    .update({ starting_balance: balance, starting_balance_date: date })
    .eq("id", accountId);

  if (error) {
    throw new Error(`Failed to set starting balance: ${error.message}`);
  }

  await recordAuditLog({
    actor,
    action: "update",
    entityType: "bank_account_starting_balance",
    entityId: accountId,
    entityLabel: before?.name ?? before?.mask ?? "Bank account",
    before,
    after: { starting_balance: balance, starting_balance_date: date },
  });

  revalidatePath("/reconciliation");
  revalidatePath(`/reconciliation/${accountId}`);
}
