"use server";

// Stage 7 review page: lets a staff member override a customer's
// auto-computed invoicing mode. Setting source to 'manual' here is what
// protects the row from ever being touched again by the backfill route
// (see lib/invoicingMode.ts's getCustomersNeedingInvoicingModeBackfill),
// so Ryan's manual calls always win.
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/currentUser";
import { recordAuditLog } from "@/lib/auditLog";
import { setInvoicingMode } from "@/lib/invoicingMode";

export async function setManualInvoicingMode(
  jobberClientId: string,
  nativeEnabled: boolean,
  customerName: string | null
): Promise<{ error: string | null }> {
  const actor = await getCurrentUser();

  if (!actor) {
    return { error: "You must be signed in." };
  }

  if (!jobberClientId) {
    return { error: "Missing customer." };
  }

  const { error } = await setInvoicingMode(jobberClientId, nativeEnabled, "manual");

  if (error) {
    return { error };
  }

  await recordAuditLog({
    actor,
    action: "update",
    entityType: "invoicing_mode",
    entityId: jobberClientId,
    entityLabel: customerName ?? "Customer",
    after: { native_invoicing_enabled: nativeEnabled, invoicing_mode_source: "manual" },
    note: nativeEnabled
      ? "Manually set to native invoicing"
      : "Manually set to stay on Jobber invoicing",
  });

  revalidatePath("/invoices/routing");

  return { error: null };
}
