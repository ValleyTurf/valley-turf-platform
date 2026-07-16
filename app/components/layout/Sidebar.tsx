"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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

  return (
    <aside className="min-h-screen w-72 bg-[#174734] text-white">
      <div className="border-b border-white/10 p-8">
        <h1 className="text-2xl font-bold">
          Valley Turf Revival
        </h1>

        <p className="mt-1 text-sm text-green-100">
          Business Platform
        </p>
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
  );
}
