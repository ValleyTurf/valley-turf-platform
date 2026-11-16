// "Leaving Jobber" -- the live answer to "what still runs through
// Jobber?" (ROADMAP Top 10, second list, #7). The decision logic is in
// lib/jobberExitLogic.ts; this file reads the data.
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
import {
  buildExitReport,
  type ExitCustomer,
  type ExitInvoice,
  type ExitPayment,
  type JobberExitReport,
} from "@/lib/jobberExitLogic";

const PAGE_SIZE = 1000;

type Page<T> = { data: T[] | null; error: { message: string } | null };

// Supabase caps a response at 1000 rows and a plain select drops the
// rest silently (see lib/dailyDigest.ts), so every list here is read in
// stable, ordered pages.
async function readAll<T>(
  label: string,
  fetchPage: (from: number, to: number) => PromiseLike<Page<T>>
): Promise<T[]> {
  const rows: T[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(`Couldn't read ${label}: ${error.message}`);

    const batch = data ?? [];
    rows.push(...batch);

    if (batch.length < PAGE_SIZE) break;
  }

  return rows;
}

export type SyncStatusRow = {
  sync_type: string;
  status: string;
  last_success_at: string | null;
  last_error: string | null;
};

export type JobberExitData = JobberExitReport & {
  syncs: SyncStatusRow[];
  totalNativeCustomers: number;
  totalJobberCustomers: number;
};

export async function loadJobberExit(): Promise<JobberExitData> {
  const [customers, invoices, payments, cardRows, syncRows] = await Promise.all([
    readAll<{
      jobber_client_id: string;
      full_name: string | null;
      native_invoicing_enabled: boolean | null;
      invoicing_mode_source: string | null;
    }>("customers", (from, to) =>
      supabaseServer
        .from("customers")
        .select("jobber_client_id, full_name, native_invoicing_enabled, invoicing_mode_source")
        .not("jobber_client_id", "is", null)
        .order("jobber_client_id", { ascending: true })
        .range(from, to)
    ),

    readAll<{
      jobber_invoice_id: string;
      jobber_client_id: string | null;
      status: string | null;
      total: number | string | null;
      issue_date: string | null;
      invoice_number: string | null;
    }>("invoices", (from, to) =>
      supabaseServer
        .from("jobber_invoices")
        .select("jobber_invoice_id, jobber_client_id, status, total, issue_date, invoice_number")
        .not("jobber_invoice_id", "like", "native-%")
        .order("jobber_invoice_id", { ascending: true })
        .range(from, to)
    ),

    readAll<{
      jobber_payment_id: string;
      amount: number | string | null;
      payment_date: string | null;
    }>("payments", (from, to) =>
      supabaseServer
        .from("jobber_payments")
        .select("jobber_payment_id, amount, payment_date")
        .not("jobber_payment_id", "like", "native-payment-%")
        .gte(
          "payment_date",
          new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10)
        )
        .order("jobber_payment_id", { ascending: true })
        .range(from, to)
    ),

    supabaseServer
      .from("customer_payment_methods")
      .select("jobber_client_id")
      .not("stripe_payment_method_id", "is", null),

    supabaseServer
      .from("jobber_sync_status")
      .select("sync_type, status, last_success_at, last_error")
      .order("sync_type", { ascending: true }),
  ]);

  const jobberInvoicedCustomers: ExitCustomer[] = customers
    .filter((customer) => !customer.native_invoicing_enabled)
    .map((customer) => ({
      clientId: customer.jobber_client_id,
      name: customer.full_name || "Unnamed customer",
      modeSource: customer.invoicing_mode_source,
    }));

  const exitInvoices: ExitInvoice[] = invoices.map((invoice) => ({
    clientId: invoice.jobber_client_id,
    status: invoice.status,
    total: Number(invoice.total ?? 0),
    issueDate: invoice.issue_date,
    invoiceNumber: invoice.invoice_number,
  }));

  const exitPayments: ExitPayment[] = payments.map((payment) => ({
    amount: Number(payment.amount ?? 0),
    paymentDate: payment.payment_date,
  }));

  const nativeCardClientIds = new Set(
    ((cardRows.data ?? []) as { jobber_client_id: string }[]).map(
      (row) => row.jobber_client_id
    )
  );

  const report = buildExitReport({
    jobberInvoicedCustomers,
    jobberInvoices: exitInvoices,
    jobberPayments: exitPayments,
    nativeCardClientIds,
    now: new Date(),
  });

  return {
    ...report,
    syncs: (syncRows.data ?? []) as SyncStatusRow[],
    totalJobberCustomers: jobberInvoicedCustomers.length,
    totalNativeCustomers: customers.length - jobberInvoicedCustomers.length,
  };
}
