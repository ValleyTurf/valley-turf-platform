// Supabase-backed lookup of the editable role_permissions table. The pure
// matching logic (sections, prefixes, isPathAllowedForRole) lives in
// lib/permissionRules.ts, which has zero dependency on
// lib/supabase-server.ts — see that file's comment for why that
// separation is load-bearing, not just tidy. Anything that doesn't
// specifically need getRolePermissions()/invalidatePermissionsCache()
// (a "use client" component, a test file) should import from
// lib/permissionRules.ts directly, not from here.

import { supabaseServer } from "@/lib/supabase-server";
import {
  emptyPermissions,
  type PermissionSection,
  type RolePermissionsMap,
} from "@/lib/permissionRules";

export {
  SECTIONS,
  ALWAYS_ADMIN_ONLY_PREFIXES,
  isPathAllowedForRole,
  type PermissionSection,
  type RolePermissionsMap,
} from "@/lib/permissionRules";

// Short in-memory cache so a burst of requests from the same warm
// serverless instance doesn't each hit Supabase — but short enough that a
// change made in Settings > Permissions takes effect for everyone within
// seconds, without needing anyone to log out and back in. Falls back to
// "deny everything" (fail closed) if the fetch errors, rather than
// accidentally widening access when Supabase is unreachable.
const CACHE_TTL_MS = 15_000;
let cached: { value: RolePermissionsMap; expiresAt: number } | null = null;

export function invalidatePermissionsCache(): void {
  cached = null;
}

export async function getRolePermissions(): Promise<RolePermissionsMap> {
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const { data, error } = await supabaseServer
    .from("role_permissions")
    .select("role, section, allowed");

  if (error) {
    // Fail closed: an unreachable table should never silently grant
    // access. Don't cache the failure — retry on the next request.
    return emptyPermissions();
  }

  const result = emptyPermissions();

  for (const row of (data ?? []) as Array<{
    role: string;
    section: string;
    allowed: boolean;
  }>) {
    if (
      (row.role === "manager" || row.role === "staff") &&
      row.section in result.manager
    ) {
      result[row.role][row.section as PermissionSection] = row.allowed;
    }
  }

  cached = { value: result, expiresAt: Date.now() + CACHE_TTL_MS };

  return result;
}
