"use server";

// Tier 3 (Jobber Independence Roadmap) — admin controls for the two
// automated customer-messaging features added this stage: pre-visit
// reminders (visit_reminder_rules) and review requests
// (review_request_settings). See lib/visitReminders.ts and
// lib/reviewRequests.ts for what actually sends the messages — this file
// only edits the settings rows those crons read.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { getCurrentUser } from "@/lib/currentUser";
import { recordAuditLog } from "@/lib/auditLog";

async function requireAdmin() {
  const user = await getCurrentUser();

  if (!user || user.role !== "admin") {
    redirect("/my-day");
  }

  return user;
}

export async function updateReminderRule(
  ruleId: string,
  formData: FormData
): Promise<void> {
  const actor = await requireAdmin();

  const daysBeforeRaw = formData.get("days_before");
  const daysBefore = typeof daysBeforeRaw === "string" ? Number(daysBeforeRaw) : NaN;
  const enabled = formData.get("enabled") === "on";

  if (!Number.isFinite(daysBefore) || daysBefore < 1) {
    throw new Error("Days before must be a positive number.");
  }

  const { data: before } = await supabaseServer
    .from("visit_reminder_rules")
    .select("days_before, enabled")
    .eq("id", ruleId)
    .maybeSingle();

  const { error } = await supabaseServer
    .from("visit_reminder_rules")
    .update({
      days_before: daysBefore,
      enabled,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ruleId);

  if (error) {
    throw new Error(`Failed to update reminder rule: ${error.message}`);
  }

  await recordAuditLog({
    actor,
    action: "update",
    entityType: "visit_reminder_rule",
    entityId: ruleId,
    entityLabel: `${daysBefore}-day reminder`,
    before,
    after: { days_before: daysBefore, enabled },
  });

  revalidatePath("/settings/notifications");
}

export async function updateReviewRequestSettings(formData: FormData): Promise<void> {
  const actor = await requireAdmin();

  const enabled = formData.get("enabled") === "on";
  const daysAfterRaw = formData.get("days_after_visit");
  const daysAfter = typeof daysAfterRaw === "string" ? Number(daysAfterRaw) : NaN;
  const googleReviewUrl = (formData.get("google_review_url") as string | null)?.trim() || null;

  if (!Number.isFinite(daysAfter) || daysAfter < 0) {
    throw new Error("Days after visit must be zero or a positive number.");
  }

  // A second, server-side guard against turning this on with nowhere to
  // send customers — matches lib/reviewRequests.ts's own check, just
  // surfaced as a clear error here instead of a silent no-op cron run.
  if (enabled && !googleReviewUrl) {
    throw new Error(
      "Add a Google review link before turning review requests on."
    );
  }

  const { data: before } = await supabaseServer
    .from("review_request_settings")
    .select("enabled, days_after_visit, google_review_url")
    .eq("id", 1)
    .maybeSingle();

  const { error } = await supabaseServer
    .from("review_request_settings")
    .update({
      enabled,
      days_after_visit: daysAfter,
      google_review_url: googleReviewUrl,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);

  if (error) {
    throw new Error(`Failed to update review request settings: ${error.message}`);
  }

  await recordAuditLog({
    actor,
    action: "update",
    entityType: "review_request_settings",
    entityId: "singleton",
    entityLabel: "Review request settings",
    before,
    after: { enabled, days_after_visit: daysAfter, google_review_url: googleReviewUrl },
  });

  revalidatePath("/settings/notifications");
}
