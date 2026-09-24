// One-time diagnostic (2026-09-24). Ryan wants Full-Monthly vs.
// Maintenance-Monthly pricing set for Patrick Durkin ($300 Full / $150
// Maintenance -- "we do both sides of the yard") and Raquel Mariscal
// ($260 Full / $150 Maintenance). Need their jobber_client_id, current
// full_cleaning_months, their future native visits' titles/months/job
// ids, and each distinct job's current price before deciding how to
// wire per-visit pricing in.
//
// Read-only, admin-gated, manual-trigger only. Does not write anything.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const { data: customers, error: customerError } = await supabaseServer
    .from("customers")
    .select(
      "jobber_client_id, full_name, first_name, last_name, service_instructions, full_cleaning_months"
    )
    .or(
      [
        "full_name.ilike.%durkin%",
        "first_name.ilike.%patrick%",
        "last_name.ilike.%durkin%",
        "full_name.ilike.%mariscal%",
        "first_name.ilike.%raquel%",
        "last_name.ilike.%mariscal%",
      ].join(",")
    );

  if (customerError) {
    return NextResponse.json(
      { success: false, error: customerError.message },
      { status: 500 }
    );
  }

  const rows = customers ?? [];

  const results = await Promise.all(
    rows.map(async (customer) => {
      const { data: visits } = await supabaseServer
        .from("jobber_visits")
        .select("jobber_visit_id, jobber_job_id, title, start_at, source, completed_at")
        .eq("jobber_client_id", customer.jobber_client_id)
        .order("start_at", { ascending: true })
        .limit(40);

      const jobIds = Array.from(
        new Set(
          (visits ?? [])
            .map((v) => v.jobber_job_id)
            .filter((id): id is string => Boolean(id))
        )
      );

      const { data: jobs } =
        jobIds.length > 0
          ? await supabaseServer
              .from("jobber_jobs")
              .select("jobber_job_id, source, total, recurrence_frequency, recurrence_anchor_date, job_status")
              .in("jobber_job_id", jobIds)
          : { data: [] };

      const { data: lineItems } =
        jobIds.length > 0
          ? await supabaseServer
              .from("native_job_line_items")
              .select("jobber_job_id, name, unit_price, quantity, sort_order")
              .in("jobber_job_id", jobIds)
              .order("sort_order", { ascending: true })
          : { data: [] };

      return {
        jobberClientId: customer.jobber_client_id,
        name:
          `${customer.first_name ?? ""} ${customer.last_name ?? ""}`.trim() ||
          customer.full_name,
        serviceInstructions: customer.service_instructions,
        fullCleaningMonths: customer.full_cleaning_months,
        jobs: jobs ?? [],
        lineItems: lineItems ?? [],
        visits: (visits ?? []).map((v) => ({
          jobberVisitId: v.jobber_visit_id,
          jobberJobId: v.jobber_job_id,
          title: v.title,
          startAt: v.start_at,
          source: v.source,
          completedAt: v.completed_at,
        })),
      };
    })
  );

  return NextResponse.json({ success: true, matchCount: results.length, results });
}
