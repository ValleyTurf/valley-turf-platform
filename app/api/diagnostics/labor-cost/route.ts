import "server-only";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// TEMPORARY diagnostic route — delete once the job-costing-analytics
// Labor $0 investigation is resolved. No PII beyond IDs/counts/dollar
// figures; no auth gate since this is short-lived and read-only.
export async function GET() {
  try {
    const { data: usage, error: usageErr } = await supabaseServer
      .from("visit_material_usage")
      .select("jobber_visit_id, material_id, quantity_used, unit_cost_at_time")
      .limit(20000);
    if (usageErr) throw usageErr;

    const materialIds = Array.from(
      new Set((usage ?? []).map((r) => r.material_id))
    );
    const { data: materials, error: materialsErr } = await supabaseServer
      .from("materials")
      .select("id, name, unit_cost");
    if (materialsErr) throw materialsErr;

    const nameMap = new Map(
      (materials ?? []).map((m) => [m.id, m.name as string | null])
    );

    const laborRows = (usage ?? []).filter((r) =>
      (nameMap.get(r.material_id) || "").startsWith("Labor - ")
    );
    const nonLaborRows = (usage ?? []).filter(
      (r) => !(nameMap.get(r.material_id) || "").startsWith("Labor - ")
    );

    const laborMaterials = (materials ?? []).filter((m) =>
      (m.name || "").startsWith("Labor - ")
    );

    const { count: totalVisits } = await supabaseServer
      .from("jobber_visits")
      .select("*", { count: "exact", head: true });
    const { count: visitsWithInvoice } = await supabaseServer
      .from("jobber_visits")
      .select("*", { count: "exact", head: true })
      .not("jobber_invoice_id", "is", null);

    const { count: totalTimeLogs } = await supabaseServer
      .from("visit_time_logs")
      .select("*", { count: "exact", head: true });
    const { count: completedTimeLogs } = await supabaseServer
      .from("visit_time_logs")
      .select("*", { count: "exact", head: true })
      .not("stopped_at", "is", null);

    const { data: breakdownSample, error: breakdownErr } = await supabaseServer
      .from("invoice_cost_breakdown")
      .select(
        "jobber_invoice_id, jobber_client_id, issue_date, revenue, direct_cost, overhead_allocated, service_category"
      )
      .gt("direct_cost", 0)
      .order("issue_date", { ascending: false })
      .limit(3);
    if (breakdownErr) throw breakdownErr;

    const sampleDetail = [];
    for (const inv of breakdownSample ?? []) {
      const { data: visits } = await supabaseServer
        .from("jobber_visits")
        .select("jobber_visit_id, jobber_invoice_id, jobber_job_id, start_at")
        .eq("jobber_invoice_id", inv.jobber_invoice_id);

      const visitIds = (visits ?? []).map((v) => v.jobber_visit_id);

      const { data: usageForInvoice } = visitIds.length
        ? await supabaseServer
            .from("visit_material_usage")
            .select("jobber_visit_id, material_id, quantity_used, unit_cost_at_time")
            .in("jobber_visit_id", visitIds)
        : { data: [] };

      const { data: timeLogsForInvoice } = visitIds.length
        ? await supabaseServer
            .from("visit_time_logs")
            .select("jobber_visit_id, user_id, started_at, stopped_at")
            .in("jobber_visit_id", visitIds)
        : { data: [] };

      sampleDetail.push({
        invoice: inv,
        visitCount: visits?.length ?? 0,
        visits,
        usageRows: usageForInvoice,
        timeLogRows: timeLogsForInvoice,
      });
    }

    return NextResponse.json({
      counts: {
        totalUsageRows: usage?.length ?? 0,
        laborUsageRows: laborRows.length,
        laborUsageRowsWithZeroRate: laborRows.filter(
          (r) => Number(r.unit_cost_at_time) === 0
        ).length,
        nonLaborUsageRows: nonLaborRows.length,
        laborMaterialsDefined: laborMaterials.length,
        totalVisits,
        visitsWithInvoiceId: visitsWithInvoice,
        totalTimeLogs,
        completedTimeLogs,
      },
      laborMaterialsDefined: laborMaterials,
      sampleLaborUsageRows: laborRows.slice(0, 5),
      sampleNonLaborUsageRows: nonLaborRows.slice(0, 5).map((r) => ({
        ...r,
        materialName: nameMap.get(r.material_id),
      })),
      sampleInvoices: sampleDetail,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
