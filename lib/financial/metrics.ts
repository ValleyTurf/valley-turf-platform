import { supabaseServer } from "@/lib/supabase-server";

export type FinancialMetrics = {
  totalRevenue: number;
  revenueThisMonth: number;
  revenueThisYear: number;
  totalCollected: number;
  collectedThisMonth: number;
  outstandingReceivables: number;
  averageInvoice: number;
  averagePayment: number;
  invoicesPaid: number;
  invoicesOutstanding: number;
};

type FinancialMetricsRow = {
  total_revenue: number | string | null;
  revenue_this_month: number | string | null;
  revenue_this_year: number | string | null;
  total_collected: number | string | null;
  collected_this_month: number | string | null;
  outstanding_receivables: number | string | null;
  average_invoice: number | string | null;
  average_payment: number | string | null;
  invoices_paid: number | string | null;
  invoices_outstanding: number | string | null;
};

function toNumber(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);

  return Number.isFinite(parsed) ? parsed : 0;
}

export async function getFinancialMetrics(): Promise<FinancialMetrics> {
  const { data, error } = await supabaseServer.rpc(
    "get_financial_metrics"
  );

  if (error) {
    throw new Error(
      `Financial metrics could not be loaded: ${error.message}`
    );
  }

  const row = (data?.[0] ?? null) as FinancialMetricsRow | null;

  if (!row) {
    return {
      totalRevenue: 0,
      revenueThisMonth: 0,
      revenueThisYear: 0,
      totalCollected: 0,
      collectedThisMonth: 0,
      outstandingReceivables: 0,
      averageInvoice: 0,
      averagePayment: 0,
      invoicesPaid: 0,
      invoicesOutstanding: 0,
    };
  }

  return {
    totalRevenue: toNumber(row.total_revenue),
    revenueThisMonth: toNumber(row.revenue_this_month),
    revenueThisYear: toNumber(row.revenue_this_year),
    totalCollected: toNumber(row.total_collected),
    collectedThisMonth: toNumber(row.collected_this_month),
    outstandingReceivables: toNumber(
      row.outstanding_receivables
    ),
    averageInvoice: toNumber(row.average_invoice),
    averagePayment: toNumber(row.average_payment),
    invoicesPaid: toNumber(row.invoices_paid),
    invoicesOutstanding: toNumber(
      row.invoices_outstanding
    ),
  };
}