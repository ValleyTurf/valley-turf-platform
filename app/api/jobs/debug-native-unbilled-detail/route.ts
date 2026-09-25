// Follow-up to debug-invoice-visit-linkage (2026-09-25). That confirmed
// the sync-invoices backfill is running fine daily and EVERY Jobber-
// sourced visit this month is already linked to an invoice -- the
// $7,683 "unbilled this month" figure is 100% native jobs (40 visits),
// exactly matching Ryan's claim that only native work should still be
// unbilled. But he's now disputing the DOLLAR figure itself: "those
// visits don't add up to $7,800 worth of work." This lists all 40 native
// unbilled visits with their full pricing breakdown (price_override,
// jobber_jobs.total, recurrence info, and a duplicate-visit check per
// job/day) so the actual number can be sanity-checked line by line
// instead of guessed at.
//
// Read-only, admin-gated, manual-trigger only.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PHOENIX_TIME_ZONE = "America/Phoenix";

function getPhoenixDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PHOENIX_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  return {
    year: Number(parts.find((part) => part.type === "year")?.value ?? 0),
    month: Number(parts.find((part) => part.type === "month")?.value ?? 1),
    day: Number(parts.find((part) => part.type === "day")?.value ?? 1),
  };
}

function toNumber(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

type VisitRow = {
  jobber_visit_id: string;
  jobber_job_id: string | null;
  jobber_client_id: string | null;
  customer_name: string | null;
  title: string | null;
  start_at: string | null;
  price_override: number | string | null;
  jobber_invoice_id: string | null;
  job_status: string | null;
  completed_at: string | null;
};

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const { year, month } = getPhoenixDateParts();
  const monthStart = new Date(Date.UTC(year, month - 1, 1, 7, 0, 0, 0));
  const monthEnd = new Date(Date.UTC(year, month, 1, 7, 0, 0, 0));

  const rows: VisitRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabaseServer
      .from("jobber_visits")
      .select(
        "jobber_visit_id, jobber_job_id, jobber_client_id, customer_name, title, start_at, price_override, jobber_invoice_id, job_status, completed_at"
      )
      .gte("start_at", monthStart.toISOString())
      .lt("start_at", monthEnd.toISOString())
      .is("jobber_invoice_id", null)
      .or("job_status.is.null,job_status.neq.archived,completed_at.not.is.null")
      .order("jobber_job_id", { ascending: true })
      .range(from, from + 999);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const batch = (data ?? []) as VisitRow[];
    rows.push(...batch);
    if (batch.length < 1000) break;
  }

  const jobIds = Array.from(
    new Set(rows.map((r) => r.jobber_job_id).filter((id): id is string => Boolean(id)))
  );

  const jobsById = new Map<
    string,
    {
      source: string | null;
      total: number | string | null;
      job_status: string | null;
      recurrence_frequency: string | null;
      title: string | null;
    }
  >();
  for (let i = 0; i < jobIds.length; i += 500) {
    const batch = jobIds.slice(i, i + 500);
    const { data: jobs, error: jobsError } = await supabaseServer
      .from("jobber_jobs")
      .select("jobber_job_id, source, total, job_status, recurrence_frequency, title")
      .in("jobber_job_id", batch);
    if (jobsError) return NextResponse.json({ error: jobsError.message }, { status: 500 });
    for (const row of (jobs ?? []) as {
      jobber_job_id: string;
      source: string | null;
      total: number | string | null;
      job_status: string | null;
      recurrence_frequency: string | null;
      title: string | null;
    }[]) {
      jobsById.set(row.jobber_job_id, row);
    }
  }

  function resolveValue(v: VisitRow): number {
    if (v.price_override != null) return toNumber(v.price_override);
    if (!v.jobber_job_id) return 0;
    return toNumber(jobsById.get(v.jobber_job_id)?.total ?? 0);
  }

  // Duplicate check: more than one unbilled visit on the same job the
  // same calendar day would double-count that job's price.
  const jobDayCounts = new Map<string, number>();
  for (const v of rows) {
    if (!v.jobber_job_id || !v.start_at) continue;
    const day = v.start_at.slice(0, 10);
    const key = `${v.jobber_job_id}|${day}`;
    jobDayCounts.set(key, (jobDayCounts.get(key) ?? 0) + 1);
  }

  const detail = rows.map((v) => {
    const job = v.jobber_job_id ? jobsById.get(v.jobber_job_id) : undefined;
    const day = v.start_at ? v.start_at.slice(0, 10) : null;
    const dupKey = v.jobber_job_id && day ? `${v.jobber_job_id}|${day}` : null;
    return {
      visitId: v.jobber_visit_id,
      jobberJobId: v.jobber_job_id,
      customerName: v.customer_name,
      visitTitle: v.title,
      jobTitle: job?.title ?? null,
      startAt: v.start_at,
      completedAt: v.completed_at,
      source: job?.source ?? null,
      jobStatus: job?.job_status ?? v.job_status,
      recurrenceFrequency: job?.recurrence_frequency ?? null,
      priceOverride: v.price_override,
      jobTotal: job?.total ?? null,
      resolvedValue: resolveValue(v),
      otherUnbilledVisitsSameJobSameDay: dupKey ? (jobDayCounts.get(dupKey) ?? 1) - 1 : 0,
    };
  });

  const sumByJob = new Map<string, number>();
  for (const d of detail) {
    if (!d.jobberJobId) continue;
    sumByJob.set(d.jobberJobId, (sumByJob.get(d.jobberJobId) ?? 0) + d.resolvedValue);
  }
  const totalsByJob = Array.from(sumByJob.entries())
    .map(([jobberJobId, total]) => ({
      jobberJobId,
      total,
      visitCount: detail.filter((d) => d.jobberJobId === jobberJobId).length,
      customerName: detail.find((d) => d.jobberJobId === jobberJobId)?.customerName ?? null,
      jobTitle: detail.find((d) => d.jobberJobId === jobberJobId)?.jobTitle ?? null,
      recurrenceFrequency: detail.find((d) => d.jobberJobId === jobberJobId)?.recurrenceFrequency ?? null,
    }))
    .sort((a, b) => b.total - a.total);

  return NextResponse.json({
    success: true,
    visitCount: rows.length,
    grandTotal: detail.reduce((s, d) => s + d.resolvedValue, 0),
    detail,
    totalsByJob,
  });
}
