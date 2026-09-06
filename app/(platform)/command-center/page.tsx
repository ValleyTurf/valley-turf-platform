export const dynamic = "force-dynamic";
export const revalidate = 0;

// Unified Ops Dashboard ("Command Center") -- Ryan's #380: a single view
// pulling together live crew status, today's/this week's revenue and
// margin, the reactivation pipeline's win-back rate, and outstanding
// invoices, all in one place. Manager+ only (same as Crew Status and the
// AI Copilot) -- see lib/permissionRules.ts's MANAGER_PLUS_PREFIXES --
// deliberately a NEW page rather than folding this into /dashboard,
// since /dashboard is general_access (regular office staff can already
// see it) while crew-status data and full margin figures are already
// restricted to managers+ elsewhere in this app. Bolting them onto
// /dashboard would have quietly exposed manager-only data to anyone who
// can already see that page -- see the AI Copilot / Command Center
// scoping conversation with Ryan for the full reasoning.
//
// Every number here comes from a shared lib helper that already backs a
// real page elsewhere (Crew Status, Job Costing Analytics, Reactivation,
// the Revenue dashboard's Outstanding card) -- see each import below --
// so this page can't silently drift from what clicking through to that
// page would show.
import Link from "next/link";
import { getCurrentUser } from "@/lib/currentUser";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import { getActiveCrewSnapshot } from "@/lib/crewStatusSummary";
import { getJobCostingSummary } from "@/lib/jobCostingSummary";
import { getReactivationPipelineSummary } from "@/lib/reactivationSummary";
import { getOutstandingInvoicesSummary } from "@/lib/outstandingInvoicesSummary";

function getPhoenixToday(): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = Number(parts.find((p) => p.type === "year")?.value ?? 0);
  const month = Number(parts.find((p) => p.type === "month")?.value ?? 1);
  const day = Number(parts.find((p) => p.type === "day")?.value ?? 1);

  return new Date(Date.UTC(year, month - 1, day));
}

function formatDateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatClockTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export default async function CommandCenterPage() {
  const currentUser = await getCurrentUser();

  // Defense in depth -- proxy.ts + (platform)/layout.tsx already block
  // staff from reaching this route via MANAGER_PLUS_PREFIXES, but this
  // page renders the same "you don't have access" treatment rather than
  // crashing if that ever gets bypassed, same as crew-status/page.tsx
  // and copilot/page.tsx.
  if (!currentUser || currentUser.role === "staff") {
    return (
      <main className="min-h-screen bg-[#f5f4ef] px-4 py-6 text-[#174734] sm:px-6 sm:py-8">
        <div className="mx-auto max-w-xl">
          <section className="mt-6 rounded-2xl bg-white p-5 shadow">
            <p className="font-bold">Manager access required</p>
            <p className="mt-2 text-sm text-[#6b705c]">
              Command Center combines live crew activity with financial
              detail, so it&apos;s limited to managers and admins.{" "}
              <Link href="/my-day" className="font-semibold text-[#9c7a20] hover:underline">
                Go to My Day
              </Link>
              .
            </p>
          </section>
        </div>
      </main>
    );
  }

  const today = getPhoenixToday();
  const todayStr = formatDateInput(today);
  const weekStart = new Date(today);
  weekStart.setUTCDate(weekStart.getUTCDate() - 6);
  const weekStartStr = formatDateInput(weekStart);

  const [crewSnapshot, todaySummary, weekSummary, reactivationSummary, outstanding] =
    await Promise.all([
      getActiveCrewSnapshot(),
      getJobCostingSummary(todayStr, todayStr),
      getJobCostingSummary(weekStartStr, todayStr),
      getReactivationPipelineSummary(),
      getOutstandingInvoicesSummary(),
    ]);

  return (
    <main className="min-h-screen bg-[#f5f4ef] px-4 py-6 text-[#174734] sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
              Valley Turf Revival OS
            </p>

            <h1 className="mt-2 text-3xl font-bold sm:text-4xl">
              Command Center
            </h1>

            <p className="mt-2 max-w-2xl text-[#6b705c]">
              Everything at a glance: who&apos;s working right now, how
              today and this week are looking financially, the
              reactivation pipeline, and outstanding invoices.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/crew-status"
              className="rounded-xl border border-[#174734] px-4 py-2 text-center text-sm font-bold transition hover:bg-white"
            >
              Crew Status
            </Link>
            <Link
              href="/job-costing-analytics"
              className="rounded-xl border border-[#174734] px-4 py-2 text-center text-sm font-bold transition hover:bg-white"
            >
              Job Costing Analytics
            </Link>
            <Link
              href="/reactivation"
              className="rounded-xl bg-[#174734] px-4 py-2 text-center text-sm font-bold text-white transition hover:bg-[#226246]"
            >
              Reactivation
            </Link>
          </div>
        </header>

        <section className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-3xl bg-white p-5 shadow">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9c7a20]">
              Clocked In Right Now
            </p>
            <p className="mt-2 text-3xl font-bold">{crewSnapshot.clockedInCount}</p>
          </article>

          <article className="rounded-3xl bg-white p-5 shadow">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9c7a20]">
              Revenue Today
            </p>
            <p className="mt-2 text-3xl font-bold">
              {formatCurrency(todaySummary.totals.revenue)}
            </p>
          </article>

          <article className="rounded-3xl bg-white p-5 shadow">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9c7a20]">
              Revenue This Week
            </p>
            <p className="mt-2 text-3xl font-bold">
              {formatCurrency(weekSummary.totals.revenue)}
            </p>
            <p className="mt-1 text-sm text-[#6b705c]">
              {weekSummary.overallMargin.toFixed(1)}% margin
            </p>
          </article>

          <article className="rounded-3xl bg-white p-5 shadow">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9c7a20]">
              Outstanding Invoices
            </p>
            <p className="mt-2 text-3xl font-bold">
              {formatCurrency(outstanding.totalOutstanding)}
            </p>
            <p className="mt-1 text-sm text-[#6b705c]">
              {formatNumber(outstanding.invoiceCount)} unpaid invoice
              {outstanding.invoiceCount === 1 ? "" : "s"}
            </p>
          </article>
        </section>

        <section className="mt-6 grid gap-5 lg:grid-cols-2">
          <article className="rounded-3xl bg-white p-5 shadow sm:p-6">
            <h2 className="text-xl font-bold">Who&apos;s Working Right Now</h2>

            {crewSnapshot.crew.length === 0 ? (
              <p className="mt-4 text-sm text-[#6b705c]">
                No one is clocked in at the moment.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {crewSnapshot.crew.map((member, index) => (
                  <div
                    key={index}
                    className="rounded-xl bg-[#f7f6f1] p-4 text-sm"
                  >
                    <p className="font-bold">{member.employeeName}</p>
                    <p className="mt-1 text-[#6b705c]">
                      {member.customerName}
                      {member.jobTitle ? ` · ${member.jobTitle}` : ""}
                    </p>
                    <p className="mt-1 text-xs text-[#9c7a20]">
                      Clocked in since {formatClockTime(member.clockedInSince)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </article>

          <article className="rounded-3xl bg-white p-5 shadow sm:p-6">
            <h2 className="text-xl font-bold">Reactivation Pipeline</h2>
            <p className="mt-1 text-sm text-[#6b705c]">
              {formatNumber(reactivationSummary.totalInPipeline)} customers in
              the pipeline right now.
            </p>

            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-[#f7f6f1] p-3">
                <p className="text-[#6b705c]">Candidates</p>
                <p className="text-lg font-bold">
                  {formatNumber(reactivationSummary.candidates)}
                </p>
              </div>
              <div className="rounded-xl bg-[#f7f6f1] p-3">
                <p className="text-[#6b705c]">Cleaning Scheduled</p>
                <p className="text-lg font-bold">
                  {formatNumber(reactivationSummary.scheduled)}
                </p>
              </div>
              <div className="rounded-xl bg-[#f7f6f1] p-3">
                <p className="text-[#6b705c]">Overdue Follow-Ups</p>
                <p className="text-lg font-bold">
                  {formatNumber(reactivationSummary.overdueFollowUps)}
                </p>
              </div>
              <div className="rounded-xl bg-[#f7f6f1] p-3">
                <p className="text-[#6b705c]">Upcoming Follow-Ups</p>
                <p className="text-lg font-bold">
                  {formatNumber(reactivationSummary.upcomingFollowUps)}
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-[#e7e2d5] p-4">
              <p className="text-sm font-semibold text-[#9c7a20]">
                Win-Back, Confirmed
              </p>
              <p className="mt-1 text-2xl font-bold text-green-700">
                {formatPercent(reactivationSummary.winBackRate)}
              </p>
              <p className="mt-1 text-sm text-[#6b705c]">
                {formatNumber(reactivationSummary.wonBack)} won back out of{" "}
                {formatNumber(reactivationSummary.everContacted)} contacted
              </p>
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}
