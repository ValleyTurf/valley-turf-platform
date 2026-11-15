"use server";

import { revalidatePath } from "next/cache";
import { requireManager } from "@/lib/currentUser";
import { recordAuditLog } from "@/lib/auditLog";
import { SCHEDULE_GAP_ACK_ENTITY } from "@/lib/recurringGaps";

// "This gap is intended" on the Schedule Gaps panel. Stored as an
// audit_log row keyed by the gap's own id (job + the two dates it sits
// between) -- lib/recurringGaps.ts filters those out, so it stops
// showing here and in the daily digest, and the row itself is the
// record of who confirmed it.
export async function acknowledgeScheduleGap(formData: FormData): Promise<void> {
  const actor = await requireManager();

  const key = formData.get("key");
  const label = formData.get("label");

  if (typeof key !== "string" || !key) return;

  await recordAuditLog({
    actor,
    action: "create",
    entityType: SCHEDULE_GAP_ACK_ENTITY,
    entityId: key,
    entityLabel: typeof label === "string" && label ? label.slice(0, 300) : "Schedule gap",
    after: { intended: true },
  });

  revalidatePath("/recurring-services");
}
