export const dynamic = "force-dynamic";
export const revalidate = 0;

// Team performance scorecard -- ROADMAP.md Fresh Ideas #8. Manager+ only
// (lib/permissionRules.ts's MANAGER_PLUS_PREFIXES), same "comparative
// crew data, not for a coworker to see about coworkers" reasoning already
// applied to /crew-status and /timecards. All the actual math lives in
// lib/teamPerformance.ts; this page is display + the timeframe picker.
import Link from "next/link";
import { formatCurrency } from "@/lib/format";
import { formatHoursMinutes } from "@/lib/shiftHours";
import { toPhoenixDateString } from "@/lib/phoenixDate";
import { getTeamPerformanceSummary } from "@/lib/teamPerformance";

type Timeframe = "last-7-days" | "this-month" | "last-month" | "last-90-days";

const TIMEFRAME_OPTIONS: { value: Timeframe; label: string }[] = [
  { value: "last-7-days", label: "Last 7 Days" },
  { value: "this-month", label: "This Month" },
  { value: "last-month", label: "Last Month" },
  { value: "last-90-days", label: "Last 90 Days" },
];

function isTimeframe(value: string | undefined): value is Timeframe {
  return TIMEFRAME_OPTIONS.some((o) => o.value === value);
}

function parseDateOnly(date: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const parsed = parseDateOnly(date);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return formatDateOnly(parsed);
}

// Same "YYYY-MM-DD in the business's own timezone" basis every other
// timeframe-driven report in this app uses (see lib/phoenixDate.ts).
function dateRangeFor(timeframe: Timeframe, today: string): { start: string; end: string } {
  const [year, month] = today.split("-").map(Number);

  switch (timeframe) {
    case "last-7-days":
      return { start: addDays(today, -6), end: today };
    case "this-month":
      return { start: `${year}-${String(month).padStart(2, "0")}-01`, end: today };
    case "last-month": {
      const firstOfThisMonth = `${year}-${String(month).padStart(2, "0")}-01`;
      const lastOfPrevMonth = addDays(firstOfThisMonth, -1);
      const [prevYear, prevMonth] = lastOfPrevMonth.split("-").map(Number);
      return {
        start: `${prevYear}-${String(prevMonth).padStart(2, "0")}-01`,
        end: lastOfPrevMonth,
      };
    }
    case "last-90-days":
      return { start: addDays(today, -89), end: today };
  }
}

type TeamPerformancePageProps = {
  searchParams: Promise<{ timeframe?: string }>;
};

export default async function TeamPerformancePage({
  searchParams,
}: TeamPerformancePageProps) {
  const params = await searchParams;
  const timeframe: Timeframe = isTimeframe(params.timeframe)
    ? params.timeframe
    : "last-7-days";

  const today = toPhoenixDateString(new Date().toISOString()) ?? formatDateOnly(new Date());
  const { start, end } = dateRangeFor(timeframe, today);

  const rows = await getTeamPerformanceSummary(start, end);

  return (
    <main className="min-h-screen bg-[#f5f4ef] px-4 py-6 text-[#174734] sm:px-6 sm:py-8">
      <div className="mx-auto max-w-4xl">
        <header className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
              Valley Turf Revival OS
            </p>
            <h1 className="mt-2 text-3xl font-bold sm:text-4xl">
              Team Performance
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[#6b705c]">
              Avg time per visit (job timer) and tips per crew member, for
              reviews and scheduling decisions.
            </p>
          </div>

          <Link
            href="/reports"
            className="rounded-xl border border-[#174734] px-5 py-3 text-center text-sm font-bold transition hover:bg-white"
          >
            Back to Reports
          </Link>
        </header>

        <section className="mt-6 flex flex-wrap gap-2">
          {TIMEFRAME_OPTIONS.map((option) => (
            <Link
              key={option.value}
              href={`/reports/team-performance?timeframe=${option.value}`}
              className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
                timeframe === option.value
                  ? "bg-[#d4af37] text-[#174734]"
                  : "border border-[#d8d3c6] bg-white text-[#6b705c] hover:border-[#d4af37]"
              }`}
            >
              {option.label}
            </Link>
          ))}
        </section>

        <section className="mt-6 rounded-2xl bg-white p-5 shadow sm:p-8">
          {rows.length === 0 ? (
            <p className="text-sm text-[#6b705c]">
              No clocked visit time or tips in this period.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="border-b border-[#eee9dc] text-left text-xs font-bold uppercase tracking-wide text-[#9c7a20]">
                    <th className="py-2">Crew Member</th>
                    <th className="py-2 text-right">Visits</th>
                    <th className="py-2 text-right">Avg Time / Visit</th>
                    <th className="py-2 text-right">Tips</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eee9dc]">
                  {rows.map((row) => (
                    <tr key={row.userId}>
                      <td className="py-2 font-semibold">{row.name}</td>
                      <td className="py-2 text-right">{row.visitCount}</td>
                      <td className="py-2 text-right">
                        {row.visitCount > 0
                          ? formatHoursMinutes(row.avgMinutesPerVisit)
                          : "—"}
                      </td>
                      <td className="py-2 text-right">
                        {formatCurrency(row.totalTips)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
