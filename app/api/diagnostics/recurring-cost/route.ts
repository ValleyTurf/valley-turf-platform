import "server-only";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// TEMPORARY diagnostic route — delete once the "Labor/Materials too high
// for multi-visit recurring customers" investigation is resolved. No PII
// beyond names/IDs/counts/dollar figures already visible elsewhere in
// the app; no auth gate since this is short-lived and read-only.
//
// Usage: /api/diagnostics/recurring-cost?name=Lehi%20Cove
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const name = searchParams.get("name");
    if (!name) {
      return NextResponse.json({ error: "Pass ?name=Customer Name" }, { status: 400 });
    }

    const { data: customers, error: customerErr } = await supabaseServer
      .from("customers")
      .select("jobber_client_id, full_name")
      .ilike("full_name", `%${name}%`)
      .limit(5);
    if (customerErr) throw customerErr;

    const results = [];

    for (const customer of customers ?? []) {
      const clientId = customer.jobber_client_id;

      const [invoicesResult, visitsResult] = await Promise.all([
        supabaseServer
          .from("invoice_cost_breakdown")
          .select(
            "jobber_invoice_id, issue_date, revenue, direct_cost, overhead_allocated, service_category"
          )
          .eq("jobber_client_id", clientId)
          .order("issue_date", { ascending: false })
          .limit(6),
        supabaseServer
          .from("jobber_visits")
          .select("jobber_visit_id, jobber_invoice_id, jobber_job_id, start_at, visit_status")
          .eq("jobber_client_id", clientId)
          .order("start_at", { ascending: false })
          .limit(20),
      ]);
      if (invoicesResult.error) throw invoicesResult.error;
      if (visitsResult.error) throw visitsResult.error;

      const invoiceIdsSeen = Array.from(
        new Set(
          (visitsResult.data ?? [])
            .map((v) => v.jobber_invoice_id)
            .filter((id): id is string => Boolean(id))
        )
      );

      // For the most recent invoice, show every visit linked to it and
      // the date spread — the thing we're actually trying to see.
      const mostRecentInvoiceId = (invoicesResult.data ?? [])[0]?.jobber_invoice_id;
      let visitsForMostRecentInvoice: unknown[] = [];
      if (mostRecentInvoiceId) {
        const { data } = await supabaseServer
          .from("jobber_visits")
          .select("jobber_visit_id, jobber_invoice_id, jobber_job_id, start_at, visit_status")
          .eq("jobber_invoice_id", mostRecentInvoiceId)
          .order("start_at", { ascending: true });
        visitsForMostRecentInvoice = data ?? [];
      }

      results.push({
        customer,
        recentInvoices: invoicesResult.data,
        recentVisits: visitsResult.data,
        distinctInvoiceIdsAcrossRecentVisits: invoiceIdsSeen.length,
        mostRecentInvoiceId,
        visitsLinkedToMostRecentInvoice: visitsForMostRecentInvoice,
      });
    }

    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
