// Pure record-diffing/redaction logic for the audit trail, split out of
// lib/auditLog.ts specifically so it can be unit tested without pulling in
// lib/supabase-server.ts (which creates its Supabase client eagerly at
// module load and throws if the Supabase env vars aren't set — fine in the
// app/CI runtime, but not something a plain `vitest run` on this file
// should require).

export type PlainRecord = Record<string, unknown>;

export const REDACTED = "[redacted]";

// Fields that should never have their real value stored in the log, even
// though we still want the log to note that they changed.
export const REDACT_FIELDS = new Set([
  "password_hash",
  "password",
  "current_password",
  "new_password",
]);

// Pure bookkeeping timestamps that change on every write and would
// otherwise show up as noise on every single diff.
export const SKIP_FIELDS = new Set([
  "updated_at",
  "created_at",
  "last_synced_at",
  "last_login_at",
]);

export function sanitizeValue(key: string, value: unknown): unknown {
  if (REDACT_FIELDS.has(key)) {
    return value === undefined || value === null ? null : REDACTED;
  }

  return value ?? null;
}

export function sanitizeRecord(
  record: PlainRecord | null | undefined
): PlainRecord | null {
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
