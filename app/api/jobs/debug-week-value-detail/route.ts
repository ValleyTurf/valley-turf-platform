// Ryan (2026-09-25): "You suck at math... on the 3rd we had $225 worth
// of visits, on the 5th we had $285, and the 7th, $684. That equals
// $1,194 not $1,669. Similarly from 22-28, visits add up to $2,213 not
// $2,660."
//
// The dashboard's "Job Value by Week" bars come straight from
// app/(platform)/dashboard/page.tsx's weekTotals loop, which sums
// resolveVisitValue(visit) for every non-archived visit this month,
// where resolveVisitValue is price_override if set, else
// jobber_jobs.total for that visit's job. This route recomputes that
// exact same thing, but breaks it out per visit per day instead of
// collapsing straight to a week total, so the discrepancy against
// Ryan's manual by-hand count is visible instead of guessed at.
//
// Leading suspects worth seeing in the output:
//  - A job with more than one visit landing on the same day (would
//    double its price if jobber_jobs.total is really a per-occurrence
//    price, not a per-job total).
//  - A visit whose job total looks too large for a single occurrence
//    (would mean the "total is per-occurrence" assumption in
//    fetchJobTotals's own comment is wrong for some jobs).
//  - A visit that shouldn't be on the schedule at all for that day
//    (wrong start_at, or a status this filter should have excluded).
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

function toNumber(value: number | string | null): number {
  if (value == null) return 0;
  const n = typeof value === "string" ? parseFloat(value) : value;
  return Number.isFinite(n) ? n : 0;
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
      .or("job_status.is.null,job_status.neq.archived,completed_at.not.is.null")
      .order("start_at", { ascending: true })
      .range(from, from + 999);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const batch = (data ?? []) as VisitRow[];
    rows.push(...batch);
    if (batch.length < 1000) break;
  }

  const jobIds = Array.from(
    new Set(rows.map((r) => r.jobber_job_id).filter((id): id is string => Boolean(id)))
  );
  const jobTotals = new Map<string, number>();
  const jobMeta = new Map<
    string,
    { title: string | null; recurrence_frequency: string | null; source: string | null }
  >();
  for (let i = 0; i < jobIds.length; i += 500) {
    const batch = jobIds.slice(i, i + 500);
    const { data, error } = await supabaseServer
      .from("jobber_jobs")
      .select("jobber_job_id, total, title, recurrence_frequency, source")
      .in("jobber_job_id", batch);
    if (error) return NextResponse.json({ error: error.message, step: "jobber_jobs" }, { status: 500 });
    for (const row of (data ?? []) as {
      jobber_job_id: string;
      total: number | string | null;
      title: string | null;
      recurrence_frequency: string | null;
      source: string | null;
    }[]) {
      jobTotals.set(row.jobber_job_id, toNumber(row.total));
      jobMeta.set(row.jobber_job_id, {
        title: row.title,
        recurrence_frequency: row.recurrence_frequency,
        source: row.source,
      });
    }
  }

  function resolveValue(v: VisitRow): number {
    if (v.price_override != null) return toNumber(v.price_override);
    if (!v.jobber_job_id) return 0;
    return jobTotals.get(v.jobber_job_id) ?? 0;
  }

  function phoenixDay(iso: string) {
    return getPhoenixDateParts(new Date(iso)).day;
  }

  const byDay = new Map<number, VisitRow[]>();
  for (const v of rows) {
    if (!v.start_at) continue;
    const day = phoenixDay(v.start_at);
    const list = byDay.get(day) ?? [];
    list.push(v);
    byDay.set(day, list);
  }

  function dayDetail(day: number) {
    const visits = byDay.get(day) ?? [];
    const jobDayCounts = new Map<string, number>();
    for (const v of visits) {
      if (v.jobber_job_id) jobDayCounts.set(v.jobber_job_id, (jobDayCounts.get(v.jobber_job_id) ?? 0) + 1);
    }
    return {
      day,
      visitCount: visits.length,
      total: Math.round(visits.reduce((sum, v) => sum + resolveValue(v), 0) * 100) / 100,
      duplicateJobsThisDay: Array.from(jobDayCounts.entries())
        .filter(([, count]) => count > 1)
        .map(([jobId, count]) => ({ jobId, visitCountThisDay: count })),
      visits: visits.map((v) => ({
        visitId: v.jobber_visit_id,
        jobId: v.jobber_job_id,
        customerName: v.customer_name,
        title: v.title,
        startAt: v.start_at,
        priceOverride: v.price_override,
        jobTotal: v.jobber_job_id ? jobTotals.get(v.jobber_job_id) ?? null : null,
        resolvedValue: resolveValue(v),
        jobMeta: v.jobber_job_id ? jobMeta.get(v.jobber_job_id) ?? null : null,
        invoiceId: v.jobber_invoice_id,
        jobStatus: v.job_status,
        completedAt: v.completed_at,
      })),
    };
  }

  const requestedDays = [3, 5, 7];
  const weekRange = [22, 23, 24, 25, 26, 27, 28];

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  // Same bucket math as the dashboard's weekTotals -- bucket = floor((day-1)/7).
  const weekBuckets: { label: string; days: number[]; total: number; visitCount: number }[] = [];
  for (let b = 0; b < 5; b++) {
    const startDay = b * 7 + 1;
    const endDay = Math.min(startDay + 6, daysInMonth);
    if (startDay > daysInMonth) break;
    const days = [];
    for (let d = startDay; d <= endDay; d++) days.push(d);
    const total = days.reduce((sum, d) => sum + (byDay.get(d) ?? []).reduce((s, v) => s + resolveValue(v), 0), 0);
    const visitCount = days.reduce((sum, d) => sum + (byDay.get(d) ?? []).length, 0);
    weekBuckets.push({ label: `Wk ${b + 1}`, days, total: Math.round(total * 100) / 100, visitCount });
  }

  return NextResponse.json({
    success: true,
    monthStart: monthStart.toISOString(),
    monthEnd: monthEnd.toISOString(),
    totalVisitsThisMonth: rows.length,
    weekBuckets,
    requestedDays: requestedDays.map(dayDetail),
    week22to28: {
      total: Math.round(weekRange.reduce((sum, d) => sum + (byDay.get(d) ?? []).reduce((s, v) => s + resolveValue(v), 0), 0) * 100) / 100,
      days: weekRange.map(dayDetail),
    },
  });
}
