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
  | "jobs"
  | "customer_portal"
  | "general_access";

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
    description:
      "Revenue dashboard, Profitability Alerts, Transactions, Visits, and Seasonal Trends.",
  },
  {
    id: "marketing_analytics",
    label: "Marketing Analytics",
    description: "Campaign scan/engagement analytics (no dollar figures).",
  },
  {
    id: "customer_intelligence",
    label: "Customer Intelligence",
    description:
      "Churn-risk and value scoring on the Customers page, plus the Reactivation outreach pipeline (contact logging, follow-up scheduling, Cleaning Scheduled tracking).",
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
  {
    id: "customer_portal",
    label: "Customer Portal",
    description:
      "Viewing and replying to customer service requests and messages submitted through the customer portal.",
  },
  {
    id: "general_access",
    label: "General Access",
    description:
      "Dashboard, Schedule, Recurring Services, Customer Map, Customers, Leads, Links & QR, and Log Job Costs — everything outside the day-to-day My Day + Timeclock workflow. Off by default for staff, so field crew only see today's stops and their own clock.",
  },
];

const SECTION_PREFIXES: Record<PermissionSection, string[]> = {
  job_costing: [
    "/job-costing-analytics",
    "/materials",
    "/employees",
    "/equipment",
    "/costs",
    "/invoices",
    // Tier 1, Stage 2 test harness -- grouped with /invoices since it's
    // the same audience testing the same "get paid" workflow, just via
    // Stripe directly instead of Jobber. Not linked from customer-facing
    // pages anywhere.
    "/stripe-test",
  ],
  // /job-costing-analytics/trends is deliberately listed here, not under
  // job_costing below, even though its URL still lives under
  // /job-costing-analytics (the page didn't move, just its nav placement
  // and permission grouping) — sectionForPath() picks the longest
  // matching prefix across all sections, so this more specific entry
  // wins over job_costing's broader "/job-costing-analytics".
  financials: [
    "/revenue",
    "/alerts",
    "/transactions",
    "/visits",
    "/job-costing-analytics/trends",
  ],
  marketing_analytics: ["/analytics"],
  // /reactivation is grouped here rather than given its own section — it's
  // the outreach-workflow half of the same "who's at risk / who's worth
  // winning back" feature Customer Intelligence's Reactivation Pipeline
  // card summarizes; an admin toggling this on/off for a role should get
  // both together, not one without the other.
  customer_intelligence: ["/customers/intelligence", "/reactivation"],
  settings_audit: ["/settings", "/audit"],
  // The public accept/decline page (/q/[token]) is a separate,
  // unauthenticated route handled by proxy.ts's PUBLIC_PATHS, not this
  // section gate — this only covers the internal /quotes management
  // pages.
  quotes: ["/quotes"],
  jobs: ["/jobs"],
  customer_portal: ["/messages"],
  // Everything that used to be open to every logged-in role simply
  // because nothing gated it — not because it was ever meant to be
  // universally accessible. Grouped under one switch rather than a
  // section per page: for a crew this small, "field crew" vs. "office
  // access" is the actual distinction that matters, not page-by-page
  // toggles. My Day and Timeclock are deliberately NOT in this list —
  // they stay open to every role unconditionally.
  general_access: [
    "/dashboard",
    "/schedule",
    "/recurring-services",
    "/map",
    "/customers",
    "/leads",
    "/codes",
    "/job-costs",
  ],
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
// Knowledge Base itself (/knowledge-base and /knowledge-base/[id]) is
// deliberately NOT listed anywhere in this file — every role, staff
// included, can view it unconditionally, same as My Day/Timeclock (see
// 036_add_knowledge_base.sql for why). Only creating a new article is
// gated here; editing/deleting an existing one happens inline on the
// detail page itself and is gated by role check + requireManager() in
// the actions, not a route prefix (there's no separate /edit route to
// list a prefix for).
export const MANAGER_PLUS_PREFIXES = [
  "/crew-status",
  "/timecards",
  "/knowledge-base/new",
];

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
    customer_portal: false,
    general_access: false,
  };

  return { manager: { ...blank }, staff: { ...blank } };
}

function matchesPrefix(pathname: string, prefixes: string[]): boolean {
  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

// Longest matching prefix wins, not first-section-listed — so a more
// specific prefix in one section (e.g. financials'
// "/job-costing-analytics/trends") correctly overrides a broader prefix
// in another section that would otherwise also match (job_costing's
// "/job-costing-analytics"). Doesn't change resolution for any path
// where only one section's prefixes match at all, which was every path
// before Seasonal Trends needed to carve itself out of job_costing.
function sectionForPath(pathname: string): PermissionSection | null {
  let bestSection: PermissionSection | null = null;
  let bestPrefixLength = -1;

  for (const section of SECTIONS) {
    for (const prefix of SECTION_PREFIXES[section.id]) {
      const matches = pathname === prefix || pathname.startsWith(`${prefix}/`);
      if (matches && prefix.length > bestPrefixLength) {
        bestSection = section.id;
        bestPrefixLength = prefix.length;
      }
    }
  }

  return bestSection;
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
