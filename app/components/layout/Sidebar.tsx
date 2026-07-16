"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const navigation = [
  {
    name: "Dashboard",
    href: "/dashboard",
    icon: "🏠",
  },
  {
    name: "Customers",
    href: "/customers",
    icon: "👥",
  },
  {
    name: "Customer Intelligence",
    href: "/customers/intelligence",
    icon: "🧠",
  },
  {
    name: "Leads",
    href: "/leads",
    icon: "🎯",
  },
  {
    name: "Campaigns",
    href: "/campaigns",
    icon: "📣",
  },
  {
    name: "QR Codes",
    href: "/codes",
    icon: "📱",
  },
  {
    name: "Analytics",
    href: "/analytics",
    icon: "📊",
  },
  {
    name: "Revenue",
    href: "/revenue",
    icon: "💰",
  },
  {
    name: "Log Job Costs",
    href: "/job-costs",
    icon: "🧾",
  },
  {
    name: "Job Costing Analytics",
    href: "/job-costing-analytics",
    icon: "📈",
  },
  {
    name: "Materials",
    href: "/materials",
    icon: "🧪",
  },
  {
    name: "Equipment",
    href: "/equipment",
    icon: "🧹",
  },
  {
    name: "Overhead Costs",
    href: "/costs",
    icon: "💵",
  },
  {
    name: "System Health",
    href: "/health",
    icon: "🩺",
  },
  {
    name: "Settings",
    href: "/settings",
    icon: "⚙️",
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close the drawer automatically whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

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

        <nav className="space-y-2 p-4">
          {navigation.map((item) => {
            const active =
              item.href === "/customers"
                ? pathname === "/customers" ||
                  (
                    pathname.startsWith("/customers/") &&
                    !pathname.startsWith("/customers/intelligence")
                  )
                : pathname === item.href ||
                  pathname.startsWith(item.href + "/");

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 transition ${
                  active
                    ? "bg-[#d4af37] font-semibold text-[#174734]"
                    : "hover:bg-white/10"
                }`}
              >
                <span className="text-xl">{item.icon}</span>

                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
