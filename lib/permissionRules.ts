// Pure role/section-access logic, split out of lib/permissions.ts
// specifically so it has ZERO dependency on lib/supabase-server.ts (same
// reasoning as lib/auditDiff.ts vs lib/auditLog.ts).
//
// This isn't just a test-ability nicety here — it's load-bearing.
// app/components/layout/Sidebar.tsx is a "use client" component and
// imports isPathAllowedForRole/RolePermissionsMap for nav filtering. If
// that import path pulled in lib/supabase-server.ts (which calls
// createClient() unconditionally at module scope), that call would ship
// into the BROWSER bundle too. SUPABASE_SERVICE_ROLE_KEY isn't a
// NEXT_PUBLIC_ var, so it's undefined client-side, createClient() throws
// "supabaseKey is required" the moment the module evaluates, and since
// Sidebar renders on every page, that crashed hydration everywhere — the
// real cause of the "This page couldn't load" outage, not (only) the
// proxy.ts/Edge issue fixed earlier.
//
// Keep it this way: nothing in this file may import lib/supabase-server.ts,
// directly or transitively.

import type { Role } from "@/lib/auth";

export type PermissionSection =
  | "job_costing"
  | "financials"
  | "marketing_analytics"
  | "customer_intelligence"
  | "settings_audit"
  | "quotes"
  | "jobs";

export const SECTIONS: { id: PermissionSection; label: string; description: string }[] = [
  {
    id: "job_costing",
    label: "Job Costing",
    description:
      "Materials, Labor Rates, Equipment, Overhead Costs, Job Costing Analytics, Seasonal Trends.",
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
  {
    id: "quotes",
    label: "Quotes",
    description:
      "Creating and managing customer/lead quotes and their shareable accept/decline links.",
  },
  {
    id: "jobs",
    label: "Jobs",
    description: "Creating new jobs in Jobber directly from this app.",
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
  // The public accept/decline page (/q/[token]) is a separate,
  // unauthenticated route handled by proxy.ts's PUBLIC_PATHS, not this
  // section gate — this only covers the internal /quotes management
  // pages.
  quotes: ["/quotes"],
  jobs: ["/jobs"],
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

// Manager+ only — staff excluded, but unlike ALWAYS_ADMIN_ONLY_PREFIXES,
// managers ARE allowed. For operational oversight views where every
// crew member's live status/location is visible to whoever's running
// the day (Crew Status), which isn't something a staff member needs to
// see about their coworkers. Same "manager and above see all" rule
// already applied to My Day's assignment visibility, just enforced at
// the route level instead of in-page. Not part of the configurable
// SECTION_PREFIXES system — an admin can't grant this to staff via
// /settings/permissions, same as ALWAYS_ADMIN_ONLY_PREFIXES.
export const MANAGER_PLUS_PREFIXES = ["/crew-status"];

export type RolePermissionsMap = Record<
  Exclude<Role, "admin">,
  Record<PermissionSection, boolean>
>;

export function emptyPermissions(): RolePermissionsMap {
  const blank = {
    job_costing: false,
    financials: false,
    marketing_analytics: false,
    customer_intelligence: false,
    settings_audit: false,
    quotes: false,
    jobs: false,
  };

  return { manager: { ...blank }, staff: { ...blank } };
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

  if (role === "staff" && matchesPrefix(pathname, MANAGER_PLUS_PREFIXES)) {
    return false;
  }

  const section = sectionForPath(pathname);

  if (!section) {
    return true;
  }

  return permissions[role][section];
}
