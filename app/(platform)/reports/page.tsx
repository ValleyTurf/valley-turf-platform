export const dynamic = "force-dynamic";
export const revalidate = 0;

// Single landing spot for every report in the app -- previously each of
// these had its own top-level Sidebar line, spread across the Financial,
// Customers, Operations, and Marketing groups. Consolidated here so the
// sidebar reads as "sections" again instead of a flat list of reports.
//
// Each card's visibility is still governed by the exact same gate as
// visiting its URL directly (isPathAllowedForRole against the real
// href) -- this page doesn't invent a new permission model, it just
// stops making the user hunt across four sidebar groups for reports
// they already have access to. See hasAnyReportAccess in
// lib/permissionRules.ts for how the Sidebar decides whether to even
// show the "Reports" link itself.
import Link from "next/link";
import { getCurrentUser } from "@/lib/currentUser";
import { getRolePermissions, isPathAllowedForRole } from "@/lib/permissions";

type ReportCard = {
  title: string;
  description: string;
  href: string;
  icon: string;
};

const REPORT_CARDS: ReportCard[] = [
  {
    title: "Transactions",
    description:
      "Every payment processed through Jobber, with tips and processing fees broken out.",
    href: "/transactions",
    icon: "💳",
  },
  {
    title: "Visits",
    description:
      "Every completed visit with the revenue and service category attributed to it.",
    href: "/visits",
    icon: "🗓️",
  },
  {
    title: "Profitability Alerts",
    description:
      "Jobs and customers whose margins have slipped below target.",
    href: "/alerts",
    icon: "🚨",
  },
  {
    title: "Seasonal Trends",
    description:
      "Year-over-year and month-over-month performance by service category.",
    href: "/job-costing-analytics/trends",
    icon: "📆",
  },
  {
    title: "Recurring Revenue",
    description:
      "Current MRR, plus new and lost recurring revenue by month.",
    href: "/revenue/recurring",
    icon: "🔁",
  },
  {
    title: "Team Performance",
    description:
      "Avg time per visit and tips per crew member, for any date range.",
    href: "/reports/team-performance",
    icon: "🏅",
  },
  {
    title: "Job Costing Analytics",
    description:
      "Profit by service category for any date range, with a per-job drill-down.",
    href: "/job-costing-analytics",
    icon: "📈",
  },
  {
    title: "Invoices",
    description:
      "Every invoice created, its payment status, and a way to create new ones.",
    href: "/invoices",
    icon: "🧾",
  },
  {
    title: "Timecards",
    description: "Payroll hours, tips, and pay totals by pay period.",
    href: "/timecards",
    icon: "⏱️",
  },
  {
    title: "Marketing Analytics",
    description: "Campaign scan and engagement performance.",
    href: "/analytics",
    icon: "📣",
  },
  {
    title: "Referral Sources",
    description:
      "Where customers say they heard about us, plus who's referring the most.",
    href: "/reports/referrals",
    icon: "🤝",
  },
];

export default async function ReportsPage() {
  const [user, permissions] = await Promise.all([
    getCurrentUser(),
    getRolePermissions(),
  ]);

  const role = user?.role ?? "staff";

  const visibleCards = REPORT_CARDS.filter((card) =>
    isPathAllowedForRole(card.href, role, permissions)
  );

  return (
    <main className="min-h-screen bg-[#f5f4ef] px-4 py-6 text-[#174734] sm:px-6 sm:py-8">
      <div className="mx-auto max-w-5xl">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
          Valley Turf Revival OS
        </p>

        <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Reports</h1>

        <p className="mt-2 text-sm text-[#6b705c]">
          Every report in one place — pick one below to dig in.
        </p>

        {visibleCards.length === 0 ? (
          <section className="mt-8 rounded-2xl bg-white p-5 shadow">
            <p className="text-sm text-[#6b705c]">
              You don&apos;t currently have access to any reports. Ask an
              admin to grant access under Settings → Permissions.
            </p>
          </section>
        ) : (
          <section className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {visibleCards.map((card) => (
              <Link
                key={card.href}
                href={card.href}
                className="rounded-3xl bg-white p-6 shadow transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <span className="text-3xl">{card.icon}</span>

                <h2 className="mt-3 text-lg font-bold">{card.title}</h2>

                <p className="mt-1 text-sm text-[#6b705c]">
                  {card.description}
                </p>

                <p className="mt-4 text-sm font-semibold text-[#9c7a20]">
                  Open report →
                </p>
              </Link>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
