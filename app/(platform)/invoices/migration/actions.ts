"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/currentUser";
import { recordAuditLog } from "@/lib/auditLog";
import { sendMigrationInvites, type InviteResult } from "@/lib/nativeMigration";
import { cancelBatch, listPendingBatches, scheduleBatch } from "@/lib/nativeMigrationSchedule";
import {
  describeOpening,
  inviteWindowOpen,
  MAX_INVITES_PER_BATCH,
  validateInviteTemplate,
} from "@/lib/nativeMigrationLogic";

export type SendInvitesResult = { error: string | null; results: InviteResult[] };

// Texts (or emails) the "save a card" link to the selected customers.
// Manager or admin only, daytime Phoenix hours only, and a capped batch size
// so a stray click can't message the whole customer list.
export async function sendInvitesAction(
  jobberClientIds: string[],
  template: string
): Promise<SendInvitesResult> {
  const actor = await getCurrentUser();

  if (!actor) {
    return { error: "You must be signed in.", results: [] };
  }

  if (actor.role === "staff") {
    return { error: "Only an admin or manager can send migration invites.", results: [] };
  }

  const templateError = validateInviteTemplate(template);

  if (templateError) {
    return { error: templateError, results: [] };
  }

  const ids = Array.from(new Set(jobberClientIds)).filter(Boolean);

  if (ids.length === 0) {
    return { error: "Select at least one customer.", results: [] };
  }

  if (ids.length > MAX_INVITES_PER_BATCH) {
    return {
      error: `Send at most ${MAX_INVITES_PER_BATCH} invites at a time.`,
      results: [],
    };
  }

  if (!inviteWindowOpen(new Date())) {
    return {
      error: "Invites only go out between 9am and 6pm Phoenix time. Try again during the day.",
      results: [],
    };
  }

  const results = await sendMigrationInvites({
    jobberClientIds: ids,
    actorName: actor.name,
    template,
  });

  const sent = results.filter((r) => r.outcome === "sent_sms" || r.outcome === "sent_email").length;

  await recordAuditLog({
    actor,
    action: "create",
    entityType: "native_migration_invites",
    entityLabel: `${sent} of ${ids.length} invites sent`,
    after: { requested: ids.length, sent, message: template.trim() },
    note: "Sent 'save a card' invites to move customers from Jobber payments to native",
  });

  revalidatePath("/invoices/migration");

  return { error: null, results };
}

export type ScheduleInvitesResult = { error: string | null; message: string | null };

// Queues the selected customers to get the invite at the next 9am Phoenix
// (sent by the daily cron). Same checks as sending now, minus the hours
// window, since the whole point is to use it outside them.
export async function scheduleInvitesAction(
  jobberClientIds: string[],
  template: string
): Promise<ScheduleInvitesResult> {
  const actor = await getCurrentUser();

  if (!actor) return { error: "You must be signed in.", message: null };

  if (actor.role === "staff") {
    return { error: "Only an admin or manager can schedule migration invites.", message: null };
  }

  const templateError = validateInviteTemplate(template);
  if (templateError) return { error: templateError, message: null };

  const ids = Array.from(new Set(jobberClientIds)).filter(Boolean);

  if (ids.length === 0) return { error: "Select at least one customer.", message: null };

  if (ids.length > MAX_INVITES_PER_BATCH) {
    return { error: `Schedule at most ${MAX_INVITES_PER_BATCH} invites at a time.`, message: null };
  }

  const pending = await listPendingBatches();
  const alreadyQueued = new Set(pending.flatMap((batch) => batch.clientIds));
  const overlap = ids.filter((id) => alreadyQueued.has(id));

  if (overlap.length > 0) {
    return {
      error: `${overlap.length} of the selected customers are already scheduled. Unselect them or cancel that batch first.`,
      message: null,
    };
  }

  const now = new Date();
  const { error, sendAfter } = await scheduleBatch({
    clientIds: ids,
    template,
    actorName: actor.name,
    now,
  });

  if (error || !sendAfter) return { error: error ?? "Could not schedule.", message: null };

  await recordAuditLog({
    actor,
    action: "create",
    entityType: "native_migration_scheduled_sends",
    entityLabel: `${ids.length} invites scheduled`,
    after: { requested: ids.length, send_after: sendAfter.toISOString(), message: template.trim() },
    note: "Scheduled 'save a card' invites to go out at 9am Phoenix",
  });

  revalidatePath("/invoices/migration");

  return {
    error: null,
    message: `Scheduled ${ids.length} invite${ids.length === 1 ? "" : "s"} for ${describeOpening(sendAfter, now)} Phoenix time.`,
  };
}

export async function cancelScheduledBatchAction(batchId: string): Promise<{ error: string | null }> {
  const actor = await getCurrentUser();

  if (!actor) return { error: "You must be signed in." };
  if (actor.role === "staff") return { error: "Only an admin or manager can cancel a scheduled send." };

  const error = await cancelBatch(batchId);
  if (error) return { error };

  await recordAuditLog({
    actor,
    action: "update",
    entityType: "native_migration_scheduled_sends",
    entityId: batchId,
    entityLabel: "Scheduled invites canceled",
    note: "Canceled a scheduled batch of migration invites before it went out",
  });

  revalidatePath("/invoices/migration");
  return { error: null };
}
