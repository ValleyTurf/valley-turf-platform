import "server-only";

// I/O layer for the Transactions page/CSV export. Combines three
// already-synced Jobber tables in memory rather than adding a new sync
// route or DB view:
//   - jobber_payments        (app/api/jobber/sync-payments) — one row per
//     payment record: amount, date, method, adjustment/transaction
//     status, tip. This is the backbone of the list.
//   - jobber_payment_fees    (app/api/jobber/sync-payment-fees) — the
//     real per-transaction processing fee/surcharge.
//   - jobber_invoices        (app/api/jobber/sync-invoices) — supplies
//     invoice_number and jobber_web_uri (a direct link back to the
//     transaction in Jobber, replacing the little "Open" icon in
//     Jobber's own payments report).
// customers.full_name is preferred over jobber_invoices.customer_name
// for display since it's this app's own source of truth for a client's
// current name; the invoice's name is only used as a fallback if the
// customer record isn't found locally.
//
// jobber_payments and jobber_payment_fees are NOT joined by id, despite
// both nominally being "PaymentRecord" ids — sync-payment-fees.ts's own
// comment explains why: it deliberately goes through the top-level
// Query.paymentRecords field (resolving the polymorphic
// PaymentRecordInterface) specifically because Invoice.paymentRecords
// (what sync-payments.ts uses) is "a plain fee-less PaymentRecord type".
// Two different GraphQL paths reaching what's conceptually the same
// transaction is not a guarantee they expose the same node id — and in
// practice here they don't (this was the root cause of fees always
// showing "$0" on this page). Fees are matched to a payment the only way
// both tables actually agree: same invoice + closest matching dollar
// amount, one fee row consumed per match so multiple payments on the
// same invoice don't all claim the same fee.
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
  jobber_invoice_id: string | null;
  amount: number | string;
  fee_amount: number | string;
  surcharge_amount: number | string;
};

type MatchableFee = { amount: number; fee: number };

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

// Ordered explicitly (payment_date, then id as a tiebreaker) so repeated
// .range() calls return a stable, non-overlapping sequence. Without an
// explicit order, Postgres/PostgREST make no guarantee that two separate
// range queries return consistent results — harmless for a single-page
// result (most timeframes), but a real risk of skipped/duplicated rows
// once a range like YTD needs more than one page.
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
      .order("payment_date", { ascending: true })
      .order("jobber_payment_id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;

    const batch = (data ?? []) as PaymentRecord[];
    rows.push(...batch);

    if (batch.length < PAGE_SIZE) break;
  }

  return rows;
}

async function fetchFeesByInvoiceIds(
  ids: string[]
): Promise<Map<string, MatchableFee[]>> {
  const map = new Map<string, MatchableFee[]>();
  if (ids.length === 0) return map;

  for (let i = 0; i < ids.length; i += ID_BATCH_SIZE) {
    const batchIds = ids.slice(i, i + ID_BATCH_SIZE);

    const { data, error } = await supabaseServer
      .from("jobber_payment_fees")
      .select("jobber_invoice_id, amount, fee_amount, surcharge_amount")
      .in("jobber_invoice_id", batchIds);

    if (error) throw error;

    for (const row of (data ?? []) as FeeRecord[]) {
      if (!row.jobber_invoice_id) continue;

      const list = map.get(row.jobber_invoice_id) ?? [];
      list.push({
        amount: toNumber(row.amount),
        fee: toNumber(row.fee_amount) + toNumber(row.surcharge_amount),
      });
      map.set(row.jobber_invoice_id, list);
    }
  }

  return map;
}

// Picks the fee record on this invoice whose own payment amount is
// closest to the payment being matched, then removes it from the pool
// (mutates `candidates`) so a second payment on the same invoice can't
// also claim it. Returns 0 if the invoice has no fee records left —
// correct and expected for cash/check payments, which never generate a
// processing fee record in the first place.
function claimClosestFee(candidates: MatchableFee[], amount: number): number {
  if (candidates.length === 0) return 0;

  let bestIndex = 0;
  let bestDiff = Math.abs(candidates[0].amount - amount);

  for (let i = 1; i < candidates.length; i++) {
    const diff = Math.abs(candidates[i].amount - amount);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIndex = i;
    }
  }

  const [claimed] = candidates.splice(bestIndex, 1);
  return claimed.fee;
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

  const [feesByInvoice, invoiceMap, customerNameMap] = await Promise.all([
    fetchFeesByInvoiceIds(invoiceIds),
    fetchInvoicesByIds(invoiceIds),
    fetchCustomerNamesByIds(clientIds),
  ]);

  // Payments need to be matched against their invoice's fee candidates in
  // a stable order (oldest-first, same as fetchAllPayments) so that if
  // an invoice genuinely has two payments of different amounts, each one
  // reliably claims the fee record closest to itself rather than
  // whichever happens to be processed first.
  const allRows: TransactionRow[] = payments
    .map((payment) => {
      const invoice = invoiceMap.get(payment.jobber_invoice_id);
      const clientName =
        (payment.jobber_client_id &&
          customerNameMap.get(payment.jobber_client_id)) ||
        invoice?.customer_name ||
        "Unknown Customer";

      const amount = toNumber(payment.amount);
      const candidates = feesByInvoice.get(payment.jobber_invoice_id);

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
        amount,
        tip: toNumber(payment.tip_amount),
        fee: candidates ? claimClosestFee(candidates, amount) : 0,
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
