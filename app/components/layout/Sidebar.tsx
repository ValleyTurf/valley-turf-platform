"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

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
    name: "Customer Map",
    href: "/map",
    icon: "🗺️",
  },
];

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
    ],
  },
  {
    title: "Marketing",
    icon: "📣",
    items: [
      { name: "Leads", href: "/leads", icon: "🎯" },
      { name: "Campaigns", href: "/campaigns", icon: "📣" },
      { name: "Links & QR", href: "/codes", icon: "📱" },
      { name: "Analytics", href: "/analytics", icon: "📊" },
    ],
  },
  {
    title: "Financials",
    icon: "💰",
    items: [
      { name: "Revenue", href: "/revenue", icon: "💰" },
      { name: "Profitability Alerts", href: "/alerts", icon: "🚨" },
    ],
  },
  {
    title: "Job Costing",
    icon: "🧾",
    items: [
      { name: "Log Job Costs", href: "/job-costs", icon: "🧾" },
      {
        name: "Job Costing Analytics",
        href: "/job-costing-analytics",
        icon: "📈",
      },
      { name: "Materials", href: "/materials", icon: "🧪" },
      { name: "Employees", href: "/employees", icon: "🧑‍🔧" },
      { name: "Equipment", href: "/equipment", icon: "🧹" },
      { name: "Overhead Costs", href: "/costs", icon: "💵" },
    ],
  },
  {
    title: "Admin",
    icon: "⚙️",
    items: [{ name: "Settings", href: "/settings", icon: "⚙️" }],
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

export default function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
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
  useEffect(() => {
    setOpen(false);

    setOpenGroups((current) => {
      const activeGroup = groups.find((group) =>
        groupContainsActiveItem(pathname, group.items)
      );

      if (!activeGroup || current[activeGroup.title]) {
        return current;
      }

      return { ...current, [activeGroup.title]: true };
    });
  }, [pathname]);

  function toggleGroup(title: string) {
    setOpenGroups((current) => ({
      ...current,
      [title]: !current[title],
    }));
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
        className={`fixed inset-y-0 left-0 z-50 w-72 transform overflow-y-auto bg-[#174734] text-white transition-transform duration-200 ease-in-out md:relative md:inset-auto md:z-auto md:h-screen md:translate-x-0 ${
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
          {topLevelItems.map((item) => (
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

          {groups.map((group) => {
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
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
