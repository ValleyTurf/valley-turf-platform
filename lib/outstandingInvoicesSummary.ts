import "server-only";

import { supabaseServer } from "@/lib/supabase-server";

// Same outstanding_invoices view + sum/count that
// app/(platform)/dashboard/page.tsx already reads for its "Outstanding"
// KPI card -- pulled out so the AI Copilot and the Command Center
// dashboard read this the same way instead of each rolling their own
// copy of a five-line query.

export type OutstandingInvoicesSummary = {
  totalOutstanding: number;
  invoiceCount: number;
};

export async function getOutstandingInvoicesSummary(): Promise<OutstandingInvoicesSummary> {
  const { data, error } = await supabaseServer
    .from("outstanding_invoices")
    .select("outstanding_balance");

  if (error) {
    throw new Error(`Could not load outstanding invoices: ${error.message}`);
  }

  const rows = (data ?? []) as { outstanding_balance: number | string }[];

  return {
    totalOutstanding: rows.reduce(
      (sum, row) => sum + Number(row.outstanding_balance ?? 0),
      0
    ),
    invoiceCount: rows.length,
  };
}
