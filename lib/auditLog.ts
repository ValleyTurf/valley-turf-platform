// Audit trail: records who changed what across the sensitive parts of the
// OS (team pay/roles, campaign spend, overhead costs, materials/equipment/
// labor rates, customer profiles).
//
// Deliberately best-effort — a failure writing an audit row should never
// take down the underlying action it's describing (same philosophy as
// lib/notifications.ts's lead alerts). Failures are logged to the server
// console so they're visible without blocking the caller.
//
// The actual diff/redaction logic lives in lib/auditDiff.ts, kept separate
// so it can be unit tested without pulling in lib/supabase-server.ts (see
// that file's comment for why).

import { supabaseServer } from "@/lib/supabase-server";
import { diffRecords, sanitizeRecord, type PlainRecord } from "@/lib/auditDiff";

export type AuditActor = {
  id: string;
  name: string;
  email: string;
} | null;

export type AuditAction = "create" | "update" | "delete";

// Wraps each field of a create/delete's sanitized record as a
// {before, after} pair, matching the shape diffRecords already produces
// for updates and that the Audit Log page's AuditRowItem expects for
// every entry.
function toFieldChanges(
  sanitized: PlainRecord,
  direction: "create" | "delete"
): Record<string, { before: unknown; after: unknown }> {
  const result: Record<string, { before: unknown; after: unknown }> = {};

  for (const [key, value] of Object.entries(sanitized)) {
    result[key] =
      direction === "create"
        ? { before: null, after: value }
        : { before: value, after: null };
  }

  return result;
}

export async function recordAuditLog(params: {
  actor: AuditActor;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  entityLabel?: string | null;
  before?: PlainRecord | null;
  after?: PlainRecord | null;
  // For actions where a field-by-field diff isn't meaningful once secrets
  // are redacted (e.g. a password reset), a short human note fills in for
  // the diff so the row still gets written.
  note?: string;
}): Promise<void> {
  const {
    actor,
    action,
    entityType,
    entityId,
    entityLabel,
    before,
    after,
    note,
  } = params;

  let changes: PlainRecord | null;

  if (action === "update") {
    const diff = diffRecords(before, after);

    if (Object.keys(diff).length === 0 && !note) {
      // Nothing actually changed (or the only thing that changed was a
      // redacted/skipped field with no note explaining it) — don't write
      // a no-op row.
      return;
    }

    changes = note ? { ...diff, _note: note } : diff;
  } else if (action === "create") {
    // Shaped as {field: {before: null, after: value}} per field, NOT the
    // raw sanitized record -- the Audit Log page's AuditRowItem reads
    // every entry as {before, after} unconditionally (change.before /
    // change.after). This used to hand it the flat sanitized value
    // directly instead, so a created row with any null field (routine --
    // most optional columns are null on create) stored changes.someField
    // = null, and AuditRowItem's `change.before` crashed rendering with
    // "Cannot read properties of null" the moment that row was in the
    // first page of results -- the actual cause of the Audit Log's "page
    // couldn't load" error (see AuditRowItem's normalizeChange, which
    // also tolerates rows already written in the old flat shape).
    const sanitized = sanitizeRecord(after);
    const fieldChanges = sanitized ? toFieldChanges(sanitized, "create") : null;
    changes = fieldChanges
      ? note
        ? { ...fieldChanges, _note: note }
        : fieldChanges
      : note
        ? { _note: note }
        : null;
  } else {
    // Same fix, mirrored for delete: each field shows as {before: value,
    // after: null} instead of the bare value.
    const sanitized = sanitizeRecord(before);
    const fieldChanges = sanitized ? toFieldChanges(sanitized, "delete") : null;
    changes = fieldChanges
      ? note
        ? { ...fieldChanges, _note: note }
        : fieldChanges
      : note
        ? { _note: note }
        : null;
  }

  try {
    const { error } = await supabaseServer.from("audit_log").insert({
      actor_id: actor?.id ?? null,
      actor_name: actor?.name ?? null,
      actor_email: actor?.email ?? null,
      action,
      entity_type: entityType,
      entity_id: entityId ?? null,
      entity_label: entityLabel ?? null,
      changes,
    });

    if (error) {
      console.error("Failed to write audit log entry:", error);
    }
  } catch (error) {
    console.error("Failed to write audit log entry:", error);
  }
}
