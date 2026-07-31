"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { getCurrentUser } from "@/lib/currentUser";
import { recordAuditLog } from "@/lib/auditLog";
import { completeJobberVisit } from "@/lib/jobberVisit";

// Marks a stop done from the field — see lib/jobberVisit.ts's
// completeJobberVisit for the mutation itself. A plain <form action>
// rather than useTransition/client state (unlike the schedule page's
// reschedule/skip/assign, which all need instant local feedback in a
// modal that stays open) — My Day is otherwise a fully server-rendered
// page, and revalidatePath here is enough to make the completed stop's
// badge flip to "Done" on the next render.
export async function completeVisit(formData: FormData): Promise<void> {
  const actor = await getCurrentUser();
  const visitId = formData.get("visit_id");

  if (!actor || typeof visitId !== "string" || !visitId) {
    return;
  }

  const result = await completeJobberVisit(visitId);

  if (!result.ok) {
    // My Day has no error-banner slot today (this is a plain form, not a
    // client component with local state) — logged server-side so a
    // failure is at least visible in Vercel's logs rather than silently
    // swallowed. Worth adding an inline error surface if this turns out
    // to fail often in practice.
    console.error(`completeVisit failed for ${visitId}:`, result.error);
    return;
  }

  await supabaseServer
    .from("jobber_visits")
    .update({
      visit_status: "COMPLETED",
      completed_at: result.value.completedAt ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("jobber_visit_id", visitId);

  await recordAuditLog({
    actor,
    action: "update",
    entityType: "visit",
    entityId: visitId,
    entityLabel: "Mark visit complete",
  });

  revalidatePath("/my-day");
  revalidatePath("/schedule");
  revalidatePath("/job-costs");
  revalidatePath("/recurring-services");
}
