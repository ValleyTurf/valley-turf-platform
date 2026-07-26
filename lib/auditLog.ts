// Audit trail: records who changed what across the sensitive parts of the
// OS (team pay/roles, campaign spend, overhead costs, materials/equipment/
// labor rates, customer profiles).
//
// Deliberately best-effort — a failure writing an audit row should never
// take down the underlying action it's describing (same philosophy as
// lib/notifications.ts's lead alerts). Failures are logged to the server
// console so they're visible without blocking the caller.

import { supabaseServer } from "@/lib/supabase-server";

export type AuditActor = {
  id: string;
  name: string;
  email: string;
} | null;

export type AuditAction = "create" | "update" | "delete";

type PlainRecord = Record<string, unknown>;

const REDACTED = "[redacted]";

// Fields that should never have their real value stored in the log, even
// though we still want the log to note that they changed.
const REDACT_FIELDS = new Set([
  "password_hash",
  "password",
  "current_password",
  "new_password",
]);

// Pure bookkeeping timestamps that change on every write and would
// otherwise show up as noise on every single diff.
const SKIP_FIELDS = new Set([
  "updated_at",
  "created_at",
  "last_synced_at",
  "last_login_at",
]);

function sanitizeValue(key: string, value: unknown): unknown {
  if (REDACT_FIELDS.has(key)) {
    return value === undefined || value === null ? null : REDACTED;
  }

  return value ?? null;
}

function sanitizeRecord(record: PlainRecord | null | undefined): PlainRecord | null {
  if (!record) {
    return null;
  }

  const result: PlainRecord = {};

  for (const [key, value] of Object.entries(record)) {
    if (SKIP_FIELDS.has(key)) {
      continue;
    }

    result[key] = sanitizeValue(key, value);
  }

  return result;
}

// Field-by-field diff between two records, after redacting secrets and
// dropping bookkeeping timestamps. Only fields that actually changed make
// it into the result.
export function diffRecords(
  before: PlainRecord | null | undefined,
  after: PlainRecord | null | undefined
): Record<string, { before: unknown; after: unknown }> {
  const beforeObj = before ?? {};
  const afterObj = after ?? {};

  const keys = new Set([
    ...Object.keys(beforeObj),
    ...Object.keys(afterObj),
  ]);

  const changes: Record<string, { before: unknown; after: unknown }> = {};

  for (const key of keys) {
    if (SKIP_FIELDS.has(key)) {
      continue;
    }

    const beforeValue = sanitizeValue(key, beforeObj[key]);
    const afterValue = sanitizeValue(key, afterObj[key]);

    if (JSON.stringify(beforeValue) !== JSON.stringify(afterValue)) {
      changes[key] = { before: beforeValue, after: afterValue };
    }
  }

  return changes;
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
    changes = sanitizeRecord(after) ?? (note ? { _note: note } : null);
  } else {
    changes = sanitizeRecord(before) ?? (note ? { _note: note } : null);
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
