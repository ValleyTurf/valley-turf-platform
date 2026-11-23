// Loads a customer's invoices for the portal from both sources and merges
// them. Native invoices are also mirrored into jobber_invoices as
// "native-<uuid>"; those mirror rows are skipped here so a native invoice
// is never listed (or counted in the balance) twice. Drafts and voids are
// hidden.
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
import { invoiceBalanceLabel, isCustomerVisibleInvoiceStatus, type InvoiceBalanceLabel } from "@/lib/portalLogic";

export type PortalInvoice = {
  key: string;
  invoiceNumber: string | null;
  issueDate: string | null;
  dueDate: string | null;
  total: number;
  balance: number;
  balanceLabel: InvoiceBalanceLabel;
  payUrl: string | null;
};

export async function loadPortalInvoices(jobberClientId: string): Promise<PortalInvoice[]> {
  const [jobberResult, nativeResult] = await Promise.all([
    supabaseServer
      .from("jobber_invoices")
      .select("jobber_invoice_id, invoice_number, status, issue_date, due_date, total, balance, jobber_web_uri")
      .eq("jobber_client_id", jobberClientId)
      .not("jobber_invoice_id", "like", "native-%")
      .order("issue_date", { ascending: false })
      .limit(50),
    supabaseServer
      .from("invoices")
      .select("id, invoice_number, status, issue_date, due_date, total, public_token")
      .eq("jobber_client_id", jobberClientId)
      .order("issue_date", { ascending: false })
      .limit(50),
  ]);

  const jobberRows = jobberResult.error ? [] : jobberResult.data ?? [];
  const nativeRows = nativeResult.error ? [] : nativeResult.data ?? [];

  const merged: PortalInvoice[] = [
    ...jobberRows
      .filter((row) => isCustomerVisibleInvoiceStatus(row.status as string | null))
      .map((row) => {
        const balance = Number(row.balance ?? 0);
        return {
          key: `jobber-${row.jobber_invoice_id}`,
          invoiceNumber: row.invoice_number as string | null,
          issueDate: row.issue_date as string | null,
          dueDate: row.due_date as string | null,
          total: Number(row.total ?? 0),
          balance,
          balanceLabel: invoiceBalanceLabel(row.status as string | null, balance),
          payUrl: row.jobber_web_uri as string | null,
        };
      }),
    // Native invoices have no partial-balance concept: only sent/overdue
    // are open for payment.
    ...nativeRows
      .filter((row) => isCustomerVisibleInvoiceStatus(row.status as string | null))
      .map((row) => {
        const open = row.status === "sent" || row.status === "overdue";
        const balance = open ? Number(row.total ?? 0) : 0;
        return {
          key: `native-${row.id}`,
          invoiceNumber: row.invoice_number as string | null,
          issueDate: row.issue_date as string | null,
          dueDate: row.due_date as string | null,
          total: Number(row.total ?? 0),
          balance,
          balanceLabel: invoiceBalanceLabel(row.status as string | null, balance),
          payUrl: row.public_token ? `/pay/${row.public_token}` : null,
        };
      }),
  ];

  return merged.sort((a, b) => {
    const aDate = a.issueDate ? new Date(a.issueDate).getTime() : 0;
    const bDate = b.issueDate ? new Date(b.issueDate).getTime() : 0;
    return bDate - aDate;
  });
}
