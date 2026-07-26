// Role-based page access. Three tiers: admin (always full access, hardcoded
// below — never stored, so nobody can lock every admin out by fat-fingering
// a checkbox), manager, and staff.
//
// Manager/staff access is split into a handful of named "sections", each
// covering one or more route prefixes. Which sections manager/staff can see
// is stored in the `role_permissions` table and editable from
// Settings > Permissions — see app/(platform)/settings/permissions.
//
// Two things are NOT part of this editable table and stay permanently
// admin-only, because they're a different risk class than "view a
// reporting page": Team (create/edit other people's logins, reset
// passwords) and the full data Backup export (all customer/financial data
// in one download). Those are ALWAYS_ADMIN_ONLY_PREFIXES below, plus
// their own requireAdmin() checks in team/actions.ts and
// api/backup/export for defense in depth.

import { supabaseServer } from "@/lib/supabase-server";
import type { Role } from "@/lib/auth";

export type PermissionSection =
  | "job_costing"
  | "financials"
  | "marketing_analytics"
  | "customer_intelligence"
  | "settings_audit";

export const SECTIONS: { id: PermissionSection; label: string; description: string }[] = [
  {
    id: "job_costing",
    label: "Job Costing",
    description:
      "Materials, Labor Rates, Equipment, Overhead Costs, Job Costing Analytics.",
  },
  {
    id: "financials",
    label: "Financials",
    description: "Revenue dashboard and Profitability Alerts.",
  },
  {
    id: "marketing_analytics",
    label: "Marketing Analytics",
    description: "Campaign scan/engagement analytics (no dollar figures).",
  },
  {
    id: "customer_intelligence",
    label: "Customer Intelligence",
    description: "Churn-risk and value scoring on the Customers page.",
  },
  {
    id: "settings_audit",
    label: "Settings & Audit Log",
    description:
      "Jobber Sync status, System Health, and the Audit Log. Does not include Team or Data Backup — those stay admin-only.",
  },
];

const SECTION_PREFIXES: Record<PermissionSection, string[]> = {
  job_costing: [
    "/job-costing-analytics",
    "/materials",
    "/employees",
    "/equipment",
    "/costs",
  ],
  financials: ["/revenue", "/alerts"],
  marketing_analytics: ["/analytics"],
  customer_intelligence: ["/customers/intelligence"],
  settings_audit: ["/settings", "/audit"],
};

// Structurally admin-only, always — not editable via role_permissions.
// /settings/permissions is listed explicitly (even though it lives under
// the settings_audit-gated /settings prefix) so a manager granted
// settings_audit still can't reach the page that controls what
// managers/staff can see — that page also does its own requireAdmin()
// check as defense in depth.
export const ALWAYS_ADMIN_ONLY_PREFIXES = [
  "/team",
  "/api/backup",
  "/settings/permissions",
];

export type RolePermissionsMap = Record<
  Exclude<Role, "admin">,
  Record<PermissionSection, boolean>
>;

function emptyPermissions(): RolePermissionsMap {
  const blank = {
    job_costing: false,
    financials: false,
    marketing_analytics: false,
    customer_intelligence: false,
    settings_audit: false,
  };

  return { manager: { ...blank }, staff: { ...blank } };
}

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

function matchesPrefix(pathname: string, prefixes: string[]): boolean {
  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function sectionForPath(pathname: string): PermissionSection | null {
  for (const section of SECTIONS) {
    if (matchesPrefix(pathname, SECTION_PREFIXES[section.id])) {
      return section.id;
    }
  }

  return null;
}

export function isPathAllowedForRole(
  pathname: string,
  role: Role,
  permissions: RolePermissionsMap
): boolean {
  if (role === "admin") {
    return true;
  }

  if (matchesPrefix(pathname, ALWAYS_ADMIN_ONLY_PREFIXES)) {
    return false;
  }

  const section = sectionForPath(pathname);

  if (!section) {
    return true;
  }

  return permissions[role][section];
}
