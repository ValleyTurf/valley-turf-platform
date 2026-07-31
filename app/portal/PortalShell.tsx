// Shared visual shell + nav for every /portal/* page. Plain server-safe
// function (not a page itself) — same "Shell" pattern app/q/[token]/page.tsx
// uses, just with a nav bar since the portal has multiple pages instead
// of one single-purpose link.
import Link from "next/link";
import type { ReactNode } from "react";

const NAV_ITEMS = [
  { href: "/portal", label: "Dashboard" },
  { href: "/portal/invoices", label: "Invoices" },
  { href: "/portal/request-service", label: "Request Service" },
  { href: "/portal/messages", label: "Messages" },
];

export function PortalShell({
  children,
  activeHref,
  customerName,
}: {
  children: ReactNode;
  activeHref?: string;
  customerName?: string | null;
}) {
  return (
    <main className="min-h-screen bg-[#f5f4ef] px-4 py-8 text-[#174734] sm:px-6">
      <div className="mx-auto max-w-3xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
              Valley Turf Revival
            </p>
            <h1 className="mt-1 text-2xl font-bold">
              {customerName ? `Welcome, ${customerName}` : "Customer Portal"}
            </h1>
          </div>

          {customerName ? (
            <form action="/portal/logout" method="POST">
              <button
                type="submit"
                className="rounded-xl border border-[#d8d3c6] bg-white px-4 py-2 text-sm font-bold text-[#6b705c] transition hover:border-[#d4af37]"
              >
                Sign out
              </button>
            </form>
          ) : null}
        </div>

        {customerName ? (
          <nav className="mt-6 flex flex-wrap gap-2">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
                  activeHref === item.href
                    ? "bg-[#174734] text-white"
                    : "border border-[#d8d3c6] bg-white text-[#174734] hover:border-[#d4af37]"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        ) : null}

        <div className="mt-8">{children}</div>
      </div>
    </main>
  );
}
