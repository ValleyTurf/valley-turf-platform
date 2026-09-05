"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
// Deliberately from lib/permissionRules, NOT lib/permissions — this is a
// "use client" component, and lib/permissions.ts pulls in
// lib/supabase-server.ts (which calls createClient() at module scope).
// That would ship a Supabase client construction into the browser
// bundle with SUPABASE_SERVICE_ROLE_KEY undefined, crashing on load.
import {
  isPathAllowedForRole,
  type RolePermissionsMap,
} from "@/lib/permissionRules";
import type { SessionUser } from "@/lib/auth";

type NavItem = {
  name: string;
  href: string;
  icon: string;
};

const topLevelItems: NavItem[] = [
  {
    name: "Dashboard",
    href: "/dashboard",
    icon: "🏠",
  },
  {
    name: "Schedule",
    href: "/schedule",
    icon: "📅",
  },
  {
    name: "My Day",
    href: "/my-day",
    icon: "🚚",
  },
  {
    name: "Timeclock",
    href: "/timeclock",
    icon: "⏰",
  },
];

// Rendered on its own, below the collapsible groups and just above the
// account/logout links at the bottom of the nav — not gated by role (see
// the comment above visibleTopLevelItems), so it's just a plain NavItem
// rendered directly in the JSX rather than filtered through a list.
const knowledgeBaseItem: NavItem = {
  name: "Knowledge Base",
  href: "/knowledge-base",
  icon: "📚",
};

// Render order below is deliberate: Customers first, then Financial,
// Operations, Marketing, Admin.
const groups: { title: string; icon: string; items: NavItem[] }[] = [
  {
    title: "Customers",
    icon: "👥",
    items: [
      { name: "Customers", href: "/customers", icon: "👥" },
      {
        name: "Customer Intelligence",
        href: "/customers/intelligence",
        icon: "🧠",
      },
      { name: "Messages", href: "/messages", icon: "💬" },
      { name: "Reactivation", href: "/reactivation", icon: "📞" },
      { name: "Customer Map", href: "/map", icon: "🗺️" },
      { name: "Recurring Services", href: "/recurring-services", icon: "🔁" },
      { name: "Create Job", href: "/jobs/new", icon: "🆕" },
      { name: "Create Invoices", href: "/invoices", icon: "💵" },
      { name: "Quotes", href: "/quotes", icon: "📝" },
      { name: "Test a Payment", href: "/stripe-test", icon: "💳" },
      { name: "Test an Invoice", href: "/invoice-test", icon: "🧾" },
    ],
  },
  {
    // Combined "Job Costing" and "Financials" into a single Financial
    // section — Create Job/Create Invoices moved out to Customers above,
    // the rest of Job Costing's items (Log Job Costs, Job Costing
    // Analytics, Materials & Costs) live here alongside the former
    // Financials items.
    title: "Financial",
    icon: "💰",
    items: [
      { name: "Revenue", href: "/revenue", icon: "💰" },
      { name: "Transactions", href: "/transactions", icon: "🧾" },
      { name: "Visits", href: "/visits", icon: "🗓️" },
      { name: "Profitability Alerts", href: "/alerts", icon: "🚨" },
      {
        name: "Seasonal Trends",
        href: "/job-costing-analytics/trends",
        icon: "📆",
      },
      { name: "Log Job Costs", href: "/job-costs", icon: "🧾" },
      {
        name: "Job Costing Analytics",
        href: "/job-costing-analytics",
        icon: "📈",
      },
      { name: "Materials & Costs", href: "/materials", icon: "🧰" },
    ],
  },
  {
    title: "Operations",
    icon: "📡",
    items: [
      { name: "Crew Status", href: "/crew-status", icon: "📡" },
      { name: "Timecards", href: "/timecards", icon: "🗓️" },
      { name: "Task List", href: "/tasks", icon: "✅" },
    ],
  },
  {
    title: "Marketing",
    icon: "📣",
    items: [
      { name: "Leads", href: "/leads", icon: "🎯" },
      { name: "Links & QR", href: "/codes", icon: "📱" },
      { name: "Analytics", href: "/analytics", icon: "📊" },
    ],
  },
  {
    title: "Admin",
    icon: "⚙️",
    items: [
      { name: "Team", href: "/team", icon: "🧑‍🤝‍🧑" },
      { name: "Audit Log", href: "/audit", icon: "🕵️" },
      { name: "Settings", href: "/settings", icon: "⚙️" },
      {
        name: "Permissions",
        href: "/settings/permissions",
        icon: "🔐",
      },
    ],
  },
];

function isItemActive(pathname: string, href: string): boolean {
  if (href === "/customers") {
    return (
      pathname === "/customers" ||
      (pathname.startsWith("/customers/") &&
        !pathname.startsWith("/customers/intelligence"))
    );
  }

  return pathname === href || pathname.startsWith(href + "/");
}

function groupContainsActiveItem(
  pathname: string,
  items: NavItem[]
): boolean {
  return items.some((item) => isItemActive(pathname, item.href));
}

export default function Sidebar({
  user,
  permissions,
  unreadMessageCount = 0,
}: {
  user: SessionUser | null;
  permissions: RolePermissionsMap;
  unreadMessageCount?: number;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // Manager/staff never see nav links to pages their role can't reach —
  // keeps the sidebar honest about what they can actually use (the proxy
  // enforces the real gate; this just avoids dead-end links). Uses the
  // same section-permission logic as the server-side gate so the two
  // never drift.
  //
  // Applies to topLevelItems too, not just the collapsible groups below:
  // Dashboard/Schedule are gated by general_access same as anything else
  // now (see lib/permissionRules.ts) — My Day and Timeclock aren't in
  // any gated prefix list, so they pass this filter unconditionally and
  // stay visible to every role. Knowledge Base is rendered separately,
  // below the groups (see knowledgeBaseItem), and is likewise never
  // gated for viewing — only /knowledge-base/new (creating an article)
  // is manager+ only, via MANAGER_PLUS_PREFIXES.
  const visibleTopLevelItems = useMemo(() => {
    if (user?.role === "admin") {
      return topLevelItems;
    }

    const role = user?.role ?? "staff";

    return topLevelItems.filter((item) =>
      isPathAllowedForRole(item.href, role, permissions)
    );
  }, [user?.role, permissions]);

  const visibleGroups = useMemo(() => {
    if (user?.role === "admin") {
      return groups;
    }

    const role = user?.role ?? "staff";

    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) =>
          isPathAllowedForRole(item.href, role, permissions)
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [user?.role, permissions]);

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      groups.map((group) => [
        group.title,
        groupContainsActiveItem(pathname, group.items),
      ])
    )
  );

  // Close the mobile drawer automatically whenever the route changes, and
  // make sure whichever group contains the new active page is expanded.
  // Deliberately NOT a useEffect — this is React's own documented
  // pattern for "adjust state when a prop changes": a conditional
  // setState call during render, guarded by comparing against the
  // previous value held in state (see
  // https://react.dev/learn/you-might-not-need-an-effect
  // #adjusting-some-state-when-a-prop-changes). An effect would apply
  // the change one render late — the drawer would still be visible for
  // one frame after navigating, before the effect ran and closed it.
  const [prevPathname, setPrevPathname] = useState(pathname);

  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setOpen(false);

    const activeGroup = groups.find((group) =>
      groupContainsActiveItem(pathname, group.items)
    );

    if (activeGroup && !openGroups[activeGroup.title]) {
      setOpenGroups({ ...openGroups, [activeGroup.title]: true });
    }
  }

  function toggleGroup(title: string) {
    setOpenGroups((current) => ({
      ...current,
      [title]: !current[title],
    }));
  }

  async function handleLogout() {
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  function linkClasses(active: boolean): string {
    return `flex items-center gap-3 rounded-xl px-4 py-3 transition ${
      active
        ? "bg-[#d4af37] font-semibold text-[#174734]"
        : "hover:bg-white/10"
    }`;
  }

  return (
    <>
      {/* Mobile top bar — only visible below the md breakpoint */}
      <div className="sticky top-0 z-30 flex items-center justify-between bg-[#174734] px-4 py-3 text-white md:hidden">
        <span className="text-lg font-bold">Valley Turf Revival</span>

        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="rounded-lg px-3 py-2 text-2xl leading-none hover:bg-white/10"
        >
          ☰
        </button>
      </div>

      {/* Backdrop, only rendered while the mobile drawer is open */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        // Mobile: a fixed, full-viewport-height drawer with its own
        // scroll (overflow-y-auto), since it overlays the page rather
        // than sitting in its flow. Desktop (md:): explicitly undoes
        // both of those — no fixed height, no clipped overflow — so the
        // sidebar instead stretches to match the height of whichever
        // sibling (the page content) is taller, via the parent flex
        // row's default align-items: stretch ((platform)/layout.tsx).
        // It used to be pinned to exactly one viewport tall
        // (md:h-screen) with overflow-y-auto giving it its own separate
        // internal scrollbar for the nav once that filled up — so on any
        // page taller than one screen, the sidebar visually stopped
        // after the first viewport instead of running the full length
        // of the page like the user expected.
        className={`fixed inset-y-0 left-0 z-50 w-72 transform overflow-y-auto bg-[#174734] text-white transition-transform duration-200 ease-in-out md:relative md:inset-auto md:z-auto md:h-auto md:overflow-visible md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-start justify-between border-b border-white/10 p-8">
          <div>
            <h1 className="text-2xl font-bold">Valley Turf Revival</h1>

            <p className="mt-1 text-sm text-green-100">Business Platform</p>
          </div>

          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="rounded-lg px-2 py-1 text-xl leading-none hover:bg-white/10 md:hidden"
          >
            ✕
          </button>
        </div>

        <nav className="space-y-1 p-4">
          {visibleTopLevelItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={linkClasses(isItemActive(pathname, item.href))}
            >
              <span className="text-xl">{item.icon}</span>
              <span>{item.name}</span>
            </Link>
          ))}

          <div className="pt-2" />

          {visibleGroups.map((group) => {
            const isOpen = Boolean(openGroups[group.title]);

            return (
              <div key={group.title}>
                <button
                  type="button"
                  onClick={() => toggleGroup(group.title)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left text-sm font-bold uppercase tracking-wide text-green-100 transition hover:bg-white/10"
                  aria-expanded={isOpen}
                >
                  <span className="flex items-center gap-3">
                    <span className="text-xl">{group.icon}</span>
                    <span>{group.title}</span>
                    {!isOpen &&
                    unreadMessageCount > 0 &&
                    group.items.some((item) => item.href === "/messages") ? (
                      <span className="rounded-full bg-[#d4af37] px-2 py-0.5 text-xs font-bold normal-case tracking-normal text-[#174734]">
                        {unreadMessageCount > 99 ? "99+" : unreadMessageCount}
                      </span>
                    ) : null}
                  </span>

                  <span
                    className={`text-xs transition-transform ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  >
                    ▼
                  </span>
                </button>

                {isOpen && (
                  <div className="ml-4 mt-1 space-y-1 border-l border-white/10 pl-3">
                    {group.items.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={linkClasses(
                          isItemActive(pathname, item.href)
                        )}
                      >
                        <span className="text-lg">{item.icon}</span>
                        <span className="text-sm">{item.name}</span>
                        {item.href === "/messages" && unreadMessageCount > 0 ? (
                          <span className="ml-auto shrink-0 rounded-full bg-[#d4af37] px-2 py-0.5 text-xs font-bold text-[#174734]">
                            {unreadMessageCount > 99 ? "99+" : unreadMessageCount}
                          </span>
                        ) : null}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          <div className="pt-2" />

          <Link
            href={knowledgeBaseItem.href}
            className={linkClasses(
              isItemActive(pathname, knowledgeBaseItem.href)
            )}
          >
            <span className="text-xl">{knowledgeBaseItem.icon}</span>
            <span>{knowledgeBaseItem.name}</span>
          </Link>

          <div className="pt-2" />

          <Link
            href="/account"
            className={linkClasses(isItemActive(pathname, "/account"))}
          >
            <span className="text-xl">👤</span>
            <span className="min-w-0">
              <span className="block truncate text-sm">
                {user?.name ?? "Account"}
              </span>
              {user && (
                <span className="block text-xs font-normal capitalize text-green-100">
                  {user.role}
                </span>
              )}
            </span>
          </Link>

          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-green-100 transition hover:bg-white/10"
          >
            <span className="text-xl">🚪</span>
            <span>Log Out</span>
          </button>
        </nav>
      </aside>
    </>
  );
}
