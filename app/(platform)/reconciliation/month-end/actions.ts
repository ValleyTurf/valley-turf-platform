"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireManager } from "@/lib/currentUser";
import { supabaseServer } from "@/lib/supabase-server";
import { recordAuditLog } from "@/lib/auditLog";
import { loadChecklist, loadMonthSnapshot } from "@/lib/monthClose";
import {
  isMonthOver,
  isValidMonth,
  monthLabel,
  openItemCount,
} from "@/lib/monthCloseLogic";

function phoenixToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Phoenix" }).format(
    new Date()
  );
}

export async function closeMonth(formData: FormData): Promise<void> {
  const user = await requireManager();

  const month = String(formData.get("month") ?? "");
  const notesRaw = String(formData.get("notes") ?? "").trim();
  const acknowledged = formData.get("acknowledge_open") === "on";

  if (!isValidMonth(month)) throw new Error("Pick a valid month.");

  if (!isMonthOver(month, phoenixToday())) {
    throw new Error(`${monthLabel(month)} isn't over yet.`);
  }

  const [items, snapshot] = await Promise.all([
    loadChecklist(month),
    loadMonthSnapshot(month),
  ]);

  const open = openItemCount(items);

  if (open > 0 && !acknowledged) {
    throw new Error(
      `${open} checklist ${open === 1 ? "item is" : "items are"} still open. Tick the box to close anyway.`
    );
  }

  const { error } = await supabaseServer.from("month_closes").upsert(
    {
      month,
      closed_at: new Date().toISOString(),
      closed_by_user_id: user.id,
      closed_by_name: user.name,
      notes: notesRaw || null,
      snapshot,
      open_items_at_close: open,
    },
    { onConflict: "month" }
  );

  if (error) throw new Error(`Couldn't close the month: ${error.message}`);

  await recordAuditLog({
    actor: user,
    action: "create",
    entityType: "month_close",
    entityId: month,
    entityLabel: monthLabel(month),
    after: { month, open_items_at_close: open, revenue: snapshot.revenue },
  });

  revalidatePath("/reconciliation/month-end");
  redirect(`/reconciliation/month-end?month=${month}`);
}

export async function reopenMonth(formData: FormData): Promise<void> {
  const user = await requireManager();

  const month = String(formData.get("month") ?? "");

  if (!isValidMonth(month)) throw new Error("Pick a valid month.");

  const { error } = await supabaseServer
    .from("month_closes")
    .delete()
    .eq("month", month);

  if (error) throw new Error(`Couldn't reopen the month: ${error.message}`);

  await recordAuditLog({
    actor: user,
    action: "delete",
    entityType: "month_close",
    entityId: month,
    entityLabel: monthLabel(month),
    note: `Reopened ${monthLabel(month)}`,
  });

  revalidatePath("/reconciliation/month-end");
  redirect(`/reconciliation/month-end?month=${month}`);
}
