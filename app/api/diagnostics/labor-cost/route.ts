import "server-only";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// TEMPORARY diagnostic route — delete once the job-costing-analytics
// Labor $0 investigation is resolved. No PII beyond IDs/counts/dollar
// figures; no auth gate since this is short-lived and read-only.
//
// Kept deliberately lean and parallelized (Promise.all everywhere
// possible, one sample invoice instead of three, small explicit limits)
// after the first version timed out — too many sequential round trips
// against cold serverless connections.
export async function GET() {
  try {
    const [
      usageResult,
      materialsResult,
      totalVisitsResult,
      visitsWithInvoiceResult,
      totalTimeLogsResult,
      completedTimeLogsResult,
      breakdownSampleResult,
    ] = await Promise.all([
      supabaseServer
        .from("visit_material_usage")
        .select("jobber_visit_id, material_id, quantity_used, unit_cost_at_time")
        .limit(5000),
      supabaseServer.from("materials").select("id, name, unit_cost"),
      supabaseServer
        .from("jobber_visits")
        .select("*", { count: "exact", head: true }),
      supabaseServer
        .from("jobber_visits")
        .select("*", { count: "exact", head: true })
        .not("jobber_invoice_id", "is", null),
      supabaseServer
        .from("visit_time_logs")
        .select("*", { count: "exact", head: true }),
      supabaseServer
        .from("visit_time_logs")
        .select("*", { count: "exact", head: true })
        .not("stopped_at", "is", null),
      supabaseServer
        .from("invoice_cost_breakdown")
        .select(
          "jobber_invoice_id, jobber_client_id, issue_date, revenue, direct_cost, overhead_allocated, service_category"
        )
        .gt("direct_cost", 0)
        .order("issue_date", { ascending: false })
        .limit(1),
    ]);

    if (usageResult.error) throw usageResult.error;
    if (materialsResult.error) throw materialsResult.error;
    if (breakdownSampleResult.error) throw breakdownSampleResult.error;

    const usage = usageResult.data ?? [];
    const materials = materialsResult.data ?? [];
    const nameMap = new Map(
      materials.map((m) => [m.id, m.name as string | null])
    );

    const laborRows = usage.filter((r) =>
      (nameMap.get(r.material_id) || "").startsWith("Labor - ")
    );
    const nonLaborRows = usage.filter(
      (r) => !(nameMap.get(r.material_id) || "").startsWith("Labor - ")
    );
    const laborMaterials = materials.filter((m) =>
      (m.name || "").startsWith("Labor - ")
    );

    const inv = (breakdownSampleResult.data ?? [])[0] ?? null;
    let sampleInvoice = null;

    if (inv) {
      const visitsResult = await supabaseServer
        .from("jobber_visits")
        .select("jobber_visit_id, jobber_invoice_id, jobber_job_id, start_at")
        .eq("jobber_invoice_id", inv.jobber_invoice_id);

      const visitIds = (visitsResult.data ?? []).map((v) => v.jobber_visit_id);

      const [usageForInvoiceResult, timeLogsForInvoiceResult] = visitIds.length
        ? await Promise.all([
            supabaseServer
              .from("visit_material_usage")
              .select(
                "jobber_visit_id, material_id, quantity_used, unit_cost_at_time"
              )
              .in("jobber_visit_id", visitIds),
            supabaseServer
              .from("visit_time_logs")
              .select("jobber_visit_id, user_id, started_at, stopped_at")
              .in("jobber_visit_id", visitIds),
          ])
        : [{ data: [] }, { data: [] }];

      sampleInvoice = {
        invoice: inv,
        visitCount: visitIds.length,
        visits: visitsResult.data,
        usageRows: usageForInvoiceResult.data,
        timeLogRows: timeLogsForInvoiceResult.data,
      };
    }

    return NextResponse.json({
      counts: {
        totalUsageRowsScanned: usage.length,
        laborUsageRows: laborRows.length,
        laborUsageRowsWithZeroRate: laborRows.filter(
          (r) => Number(r.unit_cost_at_time) === 0
        ).length,
        nonLaborUsageRows: nonLaborRows.length,
        laborMaterialsDefined: laborMaterials.length,
        totalVisits: totalVisitsResult.count,
        visitsWithInvoiceId: visitsWithInvoiceResult.count,
        totalTimeLogs: totalTimeLogsResult.count,
        completedTimeLogs: completedTimeLogsResult.count,
      },
      laborMaterialsDefined: laborMaterials,
      sampleLaborUsageRows: laborRows.slice(0, 5),
      sampleNonLaborUsageRows: nonLaborRows.slice(0, 5).map((r) => ({
        ...r,
        materialName: nameMap.get(r.material_id),
      })),
      sampleInvoice,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
