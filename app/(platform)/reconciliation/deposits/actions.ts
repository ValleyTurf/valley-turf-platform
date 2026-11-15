"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/currentUser";
import { recordAuditLog } from "@/lib/auditLog";
import { matchDepositToInvoices } from "@/lib/depositMatches";

// "Match & mark paid" on the Match Deposits page. invoice_ids is a
// comma-separated list so one button can carry a multi-invoice
// suggestion (one Zelle covering two invoices). The outcome is carried
// back to the page in the URL -- same pattern the portal pages use --
// so it shows as a banner there.
export async function matchDeposit(formData: FormData): Promise<void> {
  const actor = await requireAdmin();

  const expenseId = String(formData.get("expense_id") ?? "");
  const invoiceIds = String(formData.get("invoice_ids") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const method = String(formData.get("method") ?? "Zelle");

  const result = await matchDepositToInvoices({ expenseId, invoiceIds, method, actor });

  if (!result.ok) {
    redirect(`/reconciliation/deposits?error=${encodeURIComponent(result.error)}`);
  }

  await recordAuditLog({
    actor,
    action: "create",
    entityType: "deposit_invoice_match",
    entityId: expenseId,
    entityLabel: `Deposit matched to ${result.invoiceNumbers.join(", ")}`,
    after: { invoices: result.invoiceNumbers.join(", "), method },
  });

  revalidatePath("/reconciliation");
  revalidatePath("/expenses/journal");
  revalidatePath("/invoices");

  redirect(
    `/reconciliation/deposits?matched=${encodeURIComponent(result.invoiceNumbers.join(", "))}`
  );
}
