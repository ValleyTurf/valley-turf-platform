// Single source of truth for which routes are admin-only. Imported by
// middleware.ts (server-side enforcement) and Sidebar.tsx (so staff never
// even see a nav link to a page they'll get redirected away from). Keep
// these in sync — this file exists specifically so they can't drift.

export const ADMIN_ONLY_PREFIXES = [
  "/settings",
  "/team",
  "/revenue",
  "/alerts",
  "/analytics",
  "/job-costing-analytics",
  "/materials",
  "/employees",
  "/equipment",
  "/costs",
  "/customers/intelligence",
];

export function isAdminOnlyPath(pathname: string): boolean {
  return ADMIN_ONLY_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}
