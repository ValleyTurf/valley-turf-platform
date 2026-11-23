"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/currentUser";
import { recordAuditLog } from "@/lib/auditLog";
import { sendMigrationInvites, type InviteResult } from "@/lib/nativeMigration";
import { inviteWindowOpen, MAX_INVITES_PER_BATCH } from "@/lib/nativeMigrationLogic";

export type SendInvitesResult = { error: string | null; results: InviteResult[] };

// Texts (or emails) the "save a card" link to the selected customers.
// Manager or admin only, daytime Phoenix hours only, and a capped batch size
// so a stray click can't message the whole customer list.
export async function sendInvitesAction(jobberClientIds: string[]): Promise<SendInvitesResult> {
  const actor = await getCurrentUser();

  if (!actor) {
    return { error: "You must be signed in.", results: [] };
  }

  if (actor.role === "staff") {
    return { error: "Only an admin or manager can send migration invites.", results: [] };
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

  const results = await sendMigrationInvites({ jobberClientIds: ids, actorName: actor.name });

  const sent = results.filter((r) => r.outcome === "sent_sms" || r.outcome === "sent_email").length;

  await recordAuditLog({
    actor,
    action: "create",
    entityType: "native_migration_invites",
    entityLabel: `${sent} of ${ids.length} invites sent`,
    after: { requested: ids.length, sent },
    note: "Sent 'save a card' invites to move customers from Jobber payments to native",
  });

  revalidatePath("/invoices/migration");

  return { error: null, results };
}
