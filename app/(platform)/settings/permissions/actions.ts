"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { requireAdmin } from "@/lib/currentUser";
import { recordAuditLog } from "@/lib/auditLog";
import {
  SECTIONS,
  getRolePermissions,
  invalidatePermissionsCache,
  type PermissionSection,
} from "@/lib/permissions";
import type { ActionState } from "./actionState";

const ROLES = ["manager", "staff"] as const;

// Flattens the {manager: {job_costing: bool, ...}, staff: {...}} shape
// into single-level "role_section" keys so lib/auditDiff's flat-record
// diffing can report exactly which checkboxes actually changed.
function flatten(permissions: {
  manager: Record<PermissionSection, boolean>;
  staff: Record<PermissionSection, boolean>;
}): Record<string, boolean> {
  const flat: Record<string, boolean> = {};

  for (const role of ROLES) {
    for (const section of SECTIONS) {
      flat[`${role}__${section.id}`] = permissions[role][section.id];
    }
  }

  return flat;
}

export async function updatePermissions(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await requireAdmin();

  const before = await getRolePermissions();
  const beforeFlat = flatten(before);

  const rows: { role: string; section: string; allowed: boolean }[] = [];

  for (const role of ROLES) {
    for (const section of SECTIONS) {
      rows.push({
        role,
        section: section.id,
        allowed: formData.get(`${role}__${section.id}`) === "on",
      });
    }
  }

  const { error } = await supabaseServer
    .from("role_permissions")
    .upsert(rows, { onConflict: "role,section" });

  if (error) {
    return { error: `Failed to save permissions: ${error.message}` };
  }

  invalidatePermissionsCache();

  const afterFlat: Record<string, boolean> = {};
  for (const row of rows) {
    afterFlat[`${row.role}__${row.section}`] = row.allowed;
  }

  await recordAuditLog({
    actor,
    action: "update",
    entityType: "role_permissions",
    entityLabel: "Manager/Staff section access",
    before: beforeFlat,
    after: afterFlat,
  });

  revalidatePath("/settings/permissions");

  return { error: null };
}
