"use server";

import { redirect } from "next/navigation";
import { requirePortalUser } from "@/lib/currentPortalUser";
import type { PortalSessionUser } from "@/lib/portalAuth";
import { recordAuditLog } from "@/lib/auditLog";
import { savePortalPrefs } from "@/lib/notificationPrefs";
import { parseReminderChannel } from "@/lib/notificationPrefsLogic";

export async function saveNotificationPrefs(formData: FormData): Promise<void> {
  let customer: PortalSessionUser;

  try {
    customer = await requirePortalUser();
  } catch {
    redirect("/portal/login");
  }

  const prefs = {
    reminderChannel: parseReminderChannel(formData.get("reminder_channel")),
    // Unchecked checkboxes are simply absent from the form data.
    reviewRequestsEnabled: formData.get("review_requests") === "on",
    promotionsEnabled: formData.get("promotions") === "on",
  };

  const saved = await savePortalPrefs(customer.jobberClientId, prefs);

  if (!saved) redirect("/portal/notifications?result=error");

  await recordAuditLog({
    actor: null,
    action: "update",
    entityType: "customer_notification_preferences",
    entityId: customer.jobberClientId,
    entityLabel: customer.name,
    after: { ...prefs },
    note: "Customer updated their notification preferences in the portal",
  });

  redirect("/portal/notifications?result=saved");
}
