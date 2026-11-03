"use server";

// Ryan (2026-10-13): Mountain America's Plaid consent screen forces
// "connect everything" with no per-account selection, so connecting
// pulled in his family's whole banking relationship (20 accounts)
// instead of just his 4 business ones. This lets him mark, per account,
// whether it should actually feed /expenses -- app/api/plaid/sync/route.ts
// only imports transactions from an account flagged true here
// (migration 095). New accounts default to untracked, so a future
// reconnect can't silently repeat this.
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/currentUser";
import { supabaseServer } from "@/lib/supabase-server";
import { recordAuditLog } from "@/lib/auditLog";

export async function updateTrackedAccounts(formData: FormData): Promise<void> {
  const actor = await requireAdmin();

  const { data: accounts, error: fetchError } = await supabaseServer
    .from("bank_accounts")
    .select("id, name, mask, include_in_expense_sync");

  if (fetchError) {
    throw new Error(`Failed to load bank accounts: ${fetchError.message}`);
  }

  const changes: Array<{
    id: string;
    name: string | null;
    mask: string | null;
    from: boolean;
    to: boolean;
  }> = [];

  for (const account of accounts ?? []) {
    const included = formData.get(`include_${account.id}`) === "on";

    if (included !== account.include_in_expense_sync) {
      changes.push({
        id: account.id,
        name: account.name,
        mask: account.mask,
        from: account.include_in_expense_sync,
        to: included,
      });
    }
  }

  for (const change of changes) {
    const { error } = await supabaseServer
      .from("bank_accounts")
      .update({ include_in_expense_sync: change.to })
      .eq("id", change.id);

    if (error) {
      throw new Error(
        `Failed to update ${change.name ?? change.id}: ${error.message}`
      );
    }
  }

  if (changes.length > 0) {
    await recordAuditLog({
      actor,
      action: "update",
      entityType: "bank_account_tracking",
      entityId: "bank-accounts",
      entityLabel: "Tracked bank accounts",
      after: { changes },
    });
  }

  revalidatePath("/settings/bank-feed");
}
