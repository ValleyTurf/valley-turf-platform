export const dynamic = "force-dynamic";
export const revalidate = 0;

import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentPortalUser } from "@/lib/currentPortalUser";
import { supabaseServer } from "@/lib/supabase-server";
import { formatCurrency } from "@/lib/format";
import { PortalShell } from "./PortalShell";

type UpcomingVisit = {
  jobber_visit_id: string;
  title: string | null;
  visit_status: string | null;
  start_at: string | null;
  end_at: string | null;
};

type RecentJob = {
  jobber_job_id: string;
  job_number: string | null;
  job_status: string | null;
  total: number | null;
};

type OutstandingSummary = {
  outstanding_balance: number | string | null;
};

function formatVisitTime(value: string | null): string {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export default async function PortalDashboardPage() {
  const customer = await getCurrentPortalUser();

  if (!customer) {
    redirect("/portal/login");
  }

  const nowIso = new Date().toISOString();

  const [visitsResult, jobsResult, balanceResult] = await Promise.all([
    supabaseServer
      .from("jobber_visits")
      .select("jobber_visit_id, title, visit_status, start_at, end_at")
      .eq("jobber_client_id", customer.jobberClientId)
      .gte("start_at", nowIso)
      .order("start_at", { ascending: true })
      .limit(5),

    supabaseServer
      .from("jobber_jobs")
      .select("jobber_job_id, job_number, job_status, total")
      .eq("jobber_client_id", customer.jobberClientId)
      .order("jobber_job_id", { ascending: false })
      .limit(5),

    supabaseServer
      .from("customer_financials")
      .select("outstanding_balance")
      .eq("jobber_client_id", customer.jobberClientId)
      .maybeSingle(),
  ]);

  const upcomingVisits = (visitsResult.data ?? []) as UpcomingVisit[];
  const recentJobs = (jobsResult.data ?? []) as RecentJob[];
  const outstandingBalance = Number(
    (balanceResult.data as OutstandingSummary | null)?.outstanding_balance ?? 0
  );

  return (
    <PortalShell activeHref="/portal" customerName={customer.name}>
      <div className="grid gap-6 sm:grid-cols-2">
        <section className="rounded-3xl bg-white p-6 shadow">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#9c7a20]">
            Account Balance
          </p>
          <p className="mt-3 text-3xl font-bold">
            {formatCurrency(outstandingBalance)}
          </p>
          <p className="mt-2 text-sm text-[#6b705c]">
            {outstandingBalance > 0
              ? "Outstanding across all invoices"
              : "You're all caught up"}
          </p>
          <Link
            href="/portal/invoices"
            className="mt-4 inline-block text-sm font-semibold text-[#9c7a20] hover:underline"
          >
            View invoices →
          </Link>
        </section>

        <section className="rounded-3xl bg-white p-6 shadow">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#9c7a20]">
            Need something else?
          </p>
          <p className="mt-3 text-[#174734]">
            Request additional service or send us a message any time.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/portal/request-service"
              className="rounded-xl bg-[#174734] px-4 py-2 text-sm font-bold text-white"
            >
              Request Service
            </Link>
            <Link
              href="/portal/messages"
              className="rounded-xl border border-[#d8d3c6] px-4 py-2 text-sm font-bold text-[#174734]"
            >
              Message Us
            </Link>
          </div>
        </section>
      </div>

      <section className="mt-6 rounded-3xl bg-white p-6 shadow">
        <h2 className="text-lg font-bold">Upcoming Visits</h2>

        {upcomingVisits.length === 0 ? (
          <p className="mt-4 rounded-2xl bg-[#f7f6f1] p-4 text-sm text-[#6b705c]">
            No upcoming visits scheduled right now.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {upcomingVisits.map((visit) => (
              <div
                key={visit.jobber_visit_id}
                className="rounded-2xl border border-[#e7e2d5] p-4"
              >
                <p className="font-bold">{visit.title || "Scheduled Visit"}</p>
                <p className="mt-1 text-sm text-[#6b705c]">
                  {formatVisitTime(visit.start_at)}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-6 rounded-3xl bg-white p-6 shadow">
        <h2 className="text-lg font-bold">Recent Jobs</h2>

        {recentJobs.length === 0 ? (
          <p className="mt-4 rounded-2xl bg-[#f7f6f1] p-4 text-sm text-[#6b705c]">
            No job history yet.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {recentJobs.map((job) => (
              <div
                key={job.jobber_job_id}
                className="flex items-center justify-between gap-4 rounded-2xl border border-[#e7e2d5] p-4"
              >
                <div>
                  <p className="font-bold">Job #{job.job_number || "—"}</p>
                  <p className="mt-1 text-sm text-[#6b705c]">
                    {job.job_status || "—"}
                  </p>
                </div>
                <p className="font-bold">{formatCurrency(job.total)}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </PortalShell>
  );
}
