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
    name: "Settings",
    href: "/settings",
    icon: "⚙️",
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-72 min-h-screen bg-[#174734] text-white">
      <div className="p-8 border-b border-white/10">
        <h1 className="text-2xl font-bold">
          Valley Turf Revival
        </h1>

        <p className="text-sm text-green-100 mt-1">
          Business Platform
        </p>
      </div>

      <nav className="p-4 space-y-2">
        {navigation.map((item) => {
          const active =
            pathname === item.href ||
            pathname.startsWith(item.href + "/");

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-xl px-4 py-3 transition ${
                active
                  ? "bg-[#d4af37] text-[#174734] font-semibold"
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