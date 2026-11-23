// "Send at 9am" for migration invites. Batches queued here are sent by the
// daily cron (app/api/invoices/send-scheduled-migration-invites) at the next
// 9am Phoenix, using the same skip rules as an immediate send.
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
import { recordAuditLog } from "@/lib/auditLog";
import { sendMigrationInvites, type InviteResult } from "@/lib/nativeMigration";
import { inviteWindowOpen, nextInviteOpening } from "@/lib/nativeMigrationLogic";

export type ScheduledBatch = {
  id: string;
  clientIds: string[];
  template: string;
  scheduledByName: string | null;
  sendAfter: string;
};

type BatchRow = {
  id: string;
  jobber_client_ids: string[];
  template: string;
  scheduled_by_name: string | null;
  send_after: string;
};

function toBatch(row: BatchRow): ScheduledBatch {
  return {
    id: row.id,
    clientIds: row.jobber_client_ids,
    template: row.template,
    scheduledByName: row.scheduled_by_name,
    sendAfter: row.send_after,
  };
}

export async function listPendingBatches(): Promise<ScheduledBatch[]> {
  const { data, error } = await supabaseServer
    .from("native_migration_scheduled_sends")
    .select("id, jobber_client_ids, template, scheduled_by_name, send_after")
    .eq("status", "pending")
    .order("send_after", { ascending: true });

  if (error) {
    // Most likely migration 118 has not been run yet: the page still works.
    console.error("Failed to load scheduled migration batches:", error.message);
    return [];
  }

  return ((data ?? []) as BatchRow[]).map(toBatch);
}

export async function scheduleBatch(params: {
  clientIds: string[];
  template: string;
  actorName: string;
  now?: Date;
}): Promise<{ error: string | null; sendAfter: Date | null }> {
  const sendAfter = nextInviteOpening(params.now ?? new Date());

  const { error } = await supabaseServer.from("native_migration_scheduled_sends").insert({
    jobber_client_ids: params.clientIds,
    template: params.template.trim(),
    scheduled_by_name: params.actorName,
    send_after: sendAfter.toISOString(),
  });

  if (error) {
    return {
      error: `Could not save the scheduled send (${error.message}). Has migration 118 been run?`,
      sendAfter: null,
    };
  }

  return { error: null, sendAfter };
}

export async function cancelBatch(id: string): Promise<string | null> {
  const { data, error } = await supabaseServer
    .from("native_migration_scheduled_sends")
    .update({ status: "canceled" })
    .eq("id", id)
    .eq("status", "pending")
    .select("id");

  if (error) return error.message;
  if (!data || data.length === 0) return "That batch already went out or was canceled.";
  return null;
}

export type ProcessSummary = {
  windowOpen: boolean;
  batchesSent: number;
  invitesSent: number;
  invitesSkipped: number;
  invitesFailed: number;
};

// Sends every pending batch whose time has come. Only runs inside the
// 9am-6pm Phoenix window, and claims each batch before sending so two
// overlapping runs can never text the same customers twice.
export async function processDueBatches(now: Date = new Date()): Promise<ProcessSummary> {
  const summary: ProcessSummary = {
    windowOpen: inviteWindowOpen(now),
    batchesSent: 0,
    invitesSent: 0,
    invitesSkipped: 0,
    invitesFailed: 0,
  };

  if (!summary.windowOpen) return summary;

  const { data, error } = await supabaseServer
    .from("native_migration_scheduled_sends")
    .select("id, jobber_client_ids, template, scheduled_by_name, send_after")
    .eq("status", "pending")
    .lte("send_after", now.toISOString())
    .order("send_after", { ascending: true });

  if (error) throw new Error(error.message);

  for (const row of (data ?? []) as BatchRow[]) {
    const { data: claimed } = await supabaseServer
      .from("native_migration_scheduled_sends")
      .update({ status: "sending" })
      .eq("id", row.id)
      .eq("status", "pending")
      .select("id");

    if (!claimed || claimed.length === 0) continue;

    const actorName = row.scheduled_by_name ?? "Scheduled send";
    let results: InviteResult[] = [];

    try {
      results = await sendMigrationInvites({
        jobberClientIds: row.jobber_client_ids,
        actorName,
        template: row.template,
      });
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : "Unknown error";
      await supabaseServer
        .from("native_migration_scheduled_sends")
        .update({ status: "failed", error: message })
        .eq("id", row.id);
      summary.invitesFailed += row.jobber_client_ids.length;
      continue;
    }

    const sent = results.filter((r) => r.outcome === "sent_sms" || r.outcome === "sent_email").length;
    const skipped = results.filter((r) => r.outcome === "skipped").length;
    const failed = results.filter((r) => r.outcome === "failed").length;

    await supabaseServer
      .from("native_migration_scheduled_sends")
      .update({ status: "sent", results, sent_at: new Date().toISOString() })
      .eq("id", row.id);

    await recordAuditLog({
      actor: null,
      action: "create",
      entityType: "native_migration_invites",
      entityLabel: `${sent} of ${row.jobber_client_ids.length} scheduled invites sent`,
      after: { requested: row.jobber_client_ids.length, sent, skipped, failed, message: row.template },
      note: `Scheduled 'save a card' invites went out (queued by ${actorName})`,
    });

    summary.batchesSent += 1;
    summary.invitesSent += sent;
    summary.invitesSkipped += skipped;
    summary.invitesFailed += failed;
  }

  return summary;
}
