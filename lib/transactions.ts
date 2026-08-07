import "server-only";

// I/O layer for the Transactions page/CSV export. Combines three
// already-synced Jobber tables in memory rather than adding a new sync
// route or DB view:
//   - jobber_payments        (app/api/jobber/sync-payments) — one row per
//     payment record: amount, date, method, adjustment/transaction
//     status, tip. This is the backbone of the list.
//   - jobber_payment_fees    (app/api/jobber/sync-payment-fees) — the
//     real per-transaction processing fee/surcharge, keyed by the same
//     payment record id (see that route's own comment for why this is a
//     separate sync from jobber_payments in the first place).
//   - jobber_invoices        (app/api/jobber/sync-invoices) — supplies
//     invoice_number and jobber_web_uri (a direct link back to the
//     transaction in Jobber, replacing the little "Open" icon in
//     Jobber's own payments report).
// customers.full_name is preferred over jobber_invoices.customer_name
// for display since it's this app's own source of truth for a client's
// current name; the invoice's name is only used as a fallback if the
// customer record isn't found locally.
import { supabaseServer } from "@/lib/supabase-server";
import {
  deriveTransactionType,
  filterTransactionRows,
  sortTransactionRows,
  type SortDirection,
  type TransactionRow,
  type TransactionSortField,
} from "@/lib/transactionFormatting";

export type { TransactionRow, TransactionSortField, SortDirection };

export type TransactionQuery = {
  startDate: string;
  endDate: string;
  type?: string;
  method?: string;
  search?: string;
  sortField?: TransactionSortField;
  sortDir?: SortDirection;
};

export type TransactionResult = {
  rows: TransactionRow[];
  typeOptions: string[];
  methodOptions: string[];
};

type PaymentRecord = {
  jobber_payment_id: string;
  jobber_invoice_id: string;
  jobber_client_id: string | null;
  amount: number | string;
  payment_date: string | null;
  payment_method: string | null;
  adjustment_type: string | null;
  tip_amount: number | string | null;
};

type FeeRecord = {
  jobber_payment_record_id: string;
  fee_amount: number | string;
  surcharge_amount: number | string;
};

type InvoiceRecord = {
  jobber_invoice_id: string;
  invoice_number: string | null;
  customer_name: string | null;
  jobber_web_uri: string | null;
};

type CustomerRecord = {
  jobber_client_id: string;
  full_name: string | null;
};

function toNumber(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

const PAGE_SIZE = 1000;
const ID_BATCH_SIZE = 500;

async function fetchAllPayments(
  startDate: string,
  endDate: string
): Promise<PaymentRecord[]> {
  const rows: PaymentRecord[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabaseServer
      .from("jobber_payments")
      .select(
        "jobber_payment_id, jobber_invoice_id, jobber_client_id, amount, payment_date, payment_method, adjustment_type, tip_amount"
      )
      .gte("payment_date", startDate)
      .lte("payment_date", endDate)
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;

    const batch = (data ?? []) as PaymentRecord[];
    rows.push(...batch);

    if (batch.length < PAGE_SIZE) break;
  }

  return rows;
}

async function fetchFeesByPaymentIds(
  ids: string[]
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (ids.length === 0) return map;

  for (let i = 0; i < ids.length; i += ID_BATCH_SIZE) {
    const batchIds = ids.slice(i, i + ID_BATCH_SIZE);

    const { data, error } = await supabaseServer
      .from("jobber_payment_fees")
      .select("jobber_payment_record_id, fee_amount, surcharge_amount")
      .in("jobber_payment_record_id", batchIds);

    if (error) throw error;

    for (const row of (data ?? []) as FeeRecord[]) {
      map.set(
        row.jobber_payment_record_id,
        toNumber(row.fee_amount) + toNumber(row.surcharge_amount)
      );
    }
  }

  return map;
}

async function fetchInvoicesByIds(
  ids: string[]
): Promise<Map<string, InvoiceRecord>> {
  const map = new Map<string, InvoiceRecord>();
  if (ids.length === 0) return map;

  for (let i = 0; i < ids.length; i += ID_BATCH_SIZE) {
    const batchIds = ids.slice(i, i + ID_BATCH_SIZE);

    const { data, error } = await supabaseServer
      .from("jobber_invoices")
      .select("jobber_invoice_id, invoice_number, customer_name, jobber_web_uri")
      .in("jobber_invoice_id", batchIds);

    if (error) throw error;

    for (const row of (data ?? []) as InvoiceRecord[]) {
      map.set(row.jobber_invoice_id, row);
    }
  }

  return map;
}

async function fetchCustomerNamesByIds(
  ids: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;

  for (let i = 0; i < ids.length; i += ID_BATCH_SIZE) {
    const batchIds = ids.slice(i, i + ID_BATCH_SIZE);

    const { data, error } = await supabaseServer
      .from("customers")
      .select("jobber_client_id, full_name")
      .in("jobber_client_id", batchIds);

    if (error) throw error;

    for (const row of (data ?? []) as CustomerRecord[]) {
      if (row.full_name) {
        map.set(row.jobber_client_id, row.full_name);
      }
    }
  }

  return map;
}

export async function getTransactions(
  query: TransactionQuery
): Promise<TransactionResult> {
  const payments = await fetchAllPayments(query.startDate, query.endDate);

  const paymentIds = payments.map((p) => p.jobber_payment_id);
  const invoiceIds = Array.from(
    new Set(payments.map((p) => p.jobber_invoice_id).filter(Boolean))
  );
  const clientIds = Array.from(
    new Set(
      payments
        .map((p) => p.jobber_client_id)
        .filter((id): id is string => Boolean(id))
    )
  );

  const [feeMap, invoiceMap, customerNameMap] = await Promise.all([
    fetchFeesByPaymentIds(paymentIds),
    fetchInvoicesByIds(invoiceIds),
    fetchCustomerNamesByIds(clientIds),
  ]);

  const allRows: TransactionRow[] = payments.map((payment) => {
    const invoice = invoiceMap.get(payment.jobber_invoice_id);
    const clientName =
      (payment.jobber_client_id &&
        customerNameMap.get(payment.jobber_client_id)) ||
      invoice?.customer_name ||
      "Unknown Customer";

    return {
      id: payment.jobber_payment_id,
      date: payment.payment_date,
      clientId: payment.jobber_client_id,
      clientName,
      type: deriveTransactionType(payment.adjustment_type),
      method: payment.payment_method || "Unknown",
      invoiceId: payment.jobber_invoice_id,
      invoiceNumber: invoice?.invoice_number ?? null,
      jobberWebUri: invoice?.jobber_web_uri ?? null,
      amount: toNumber(payment.amount),
      tip: toNumber(payment.tip_amount),
      fee: feeMap.get(payment.jobber_payment_id) ?? 0,
    };
  });

  // Filter dropdown options are built from everything in the date range
  // BEFORE the type/method filters are applied, so the dropdowns always
  // reflect what's actually possible to pick, not just what's currently
  // showing.
  const typeOptions = Array.from(new Set(allRows.map((row) => row.type))).sort();
  const methodOptions = Array.from(
    new Set(allRows.map((row) => row.method))
  ).sort();

  const filtered = filterTransactionRows(allRows, {
    type: query.type,
    method: query.method,
    search: query.search,
  });

  const sorted = sortTransactionRows(
    filtered,
    query.sortField ?? "date",
    query.sortDir ?? "desc"
  );

  return { rows: sorted, typeOptions, methodOptions };
}
