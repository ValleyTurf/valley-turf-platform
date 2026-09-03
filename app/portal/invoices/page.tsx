export const dynamic = "force-dynamic";
export const revalidate = 0;

// This app has two invoice sources: legacy jobber_invoices (Jobber's own
// invoicing, paid via jobber_web_uri — Jobber's hosted checkout) and the
// native `invoices` table (Tier 1 of the Jobber Independence Roadmap,
// paid via this app's own /pay/[public_token] + Stripe). Which one a
// given customer's invoices land in depends on their
// native_invoicing_enabled bucket (see lib/invoicingMode.ts and
// app/(platform)/invoices/actions.ts) — a customer fully on native
// invoicing would otherwise see nothing here at all, since this page
// used to only query jobber_invoices. Both are fetched and merged so
// every customer sees every open invoice regardless of which system
// created it.
import { redirect } from "next/navigation";
import { getCurrentPortalUser } from "@/lib/currentPortalUser";
import { supabaseServer } from "@/lib/supabase-server";
import { formatCurrencyPrecise, formatDateOnly } from "@/lib/format";
import { PortalShell } from "../PortalShell";

type JobberPortalInvoice = {
  jobber_invoice_id: string;
  invoice_number: string | null;
  status: string | null;
  issue_date: string | null;
  due_date: string | null;
  total: number | string;
  balance: number | string;
  jobber_web_uri: string | null;
};

type NativePortalInvoice = {
  id: string;
  invoice_number: string;
  status: string;
  issue_date: string | null;
  due_date: string | null;
  total: number | string;
  public_token: string | null;
};

// Unified shape both sources get normalized into for rendering — payUrl
// is either Jobber's hosted checkout or this app's own /pay/[token] page,
// whichever source the invoice came from.
type UnifiedInvoice = {
  key: string;
  invoiceNumber: string | null;
  issueDate: string | null;
  dueDate: string | null;
  total: number;
  balance: number;
  payUrl: string | null;
};

export default async function PortalInvoicesPage() {
  const customer = await getCurrentPortalUser();

  if (!customer) {
    redirect("/portal/login");
  }

  const [jobberResult, nativeResult] = await Promise.all([
    supabaseServer
      .from("jobber_invoices")
      .select(
        "jobber_invoice_id, invoice_number, status, issue_date, due_date, total, balance, jobber_web_uri"
      )
      .eq("jobber_client_id", customer.jobberClientId)
      .order("issue_date", { ascending: false })
      .limit(50),

    supabaseServer
      .from("invoices")
      .select("id, invoice_number, status, issue_date, due_date, total, public_token")
      .eq("jobber_client_id", customer.jobberClientId)
      .order("issue_date", { ascending: false })
      .limit(50),
  ]);

  const jobberInvoices = (jobberResult.error
    ? []
    : jobberResult.data ?? []) as JobberPortalInvoice[];
  const nativeInvoices = (nativeResult.error
    ? []
    : nativeResult.data ?? []) as NativePortalInvoice[];

  const unified: UnifiedInvoice[] = [
    ...jobberInvoices.map((invoice) => ({
      key: `jobber-${invoice.jobber_invoice_id}`,
      invoiceNumber: invoice.invoice_number,
      issueDate: invoice.issue_date,
      dueDate: invoice.due_date,
      total: Number(invoice.total ?? 0),
      balance: Number(invoice.balance ?? 0),
      payUrl: invoice.jobber_web_uri,
    })),
    // Native invoices have no partial-balance concept — only sent/overdue
    // are actually open for payment, so paid/draft/void all show $0 due.
    ...nativeInvoices.map((invoice) => ({
      key: `native-${invoice.id}`,
      invoiceNumber: invoice.invoice_number,
      issueDate: invoice.issue_date,
      dueDate: invoice.due_date,
      total: Number(invoice.total ?? 0),
      balance:
        invoice.status === "sent" || invoice.status === "overdue"
          ? Number(invoice.total ?? 0)
          : 0,
      payUrl: invoice.public_token ? `/pay/${invoice.public_token}` : null,
    })),
  ].sort((a, b) => {
    const aDate = a.issueDate ? new Date(a.issueDate).getTime() : 0;
    const bDate = b.issueDate ? new Date(b.issueDate).getTime() : 0;
    return bDate - aDate;
  });

  const invoices = unified;

  return (
    <PortalShell activeHref="/portal/invoices" customerName={customer.name}>
      <section className="rounded-3xl bg-white p-6 shadow">
        <h2 className="text-lg font-bold">Your Invoices</h2>
        <p className="mt-1 text-sm text-[#6b705c]">
          &ldquo;Pay Now&rdquo; takes you to our secure payment page — we
          never see or store your card details here.
        </p>

        {invoices.length === 0 ? (
          <p className="mt-4 rounded-2xl bg-[#f7f6f1] p-4 text-sm text-[#6b705c]">
            No invoices found on your account yet.
          </p>
        ) : (
          <div className="mt-5 space-y-3">
            {invoices.map((invoice) => {
              const balance = invoice.balance;

              return (
                <div
                  key={invoice.key}
                  className="rounded-2xl border border-[#e7e2d5] p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-bold">
                        Invoice #{invoice.invoiceNumber || "—"}
                      </p>
                      <p className="mt-1 text-sm text-[#6b705c]">
                        Issued {formatDateOnly(invoice.issueDate)}
                        {invoice.dueDate
                          ? ` · Due ${formatDateOnly(invoice.dueDate)}`
                          : ""}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-lg font-bold">
                        {formatCurrencyPrecise(invoice.total)}
                      </p>
                      {balance > 0 ? (
                        <p className="text-sm font-semibold text-[#9c7a20]">
                          {formatCurrencyPrecise(balance)} due
                        </p>
                      ) : (
                        <p className="text-sm font-semibold text-green-700">
                          Paid in full
                        </p>
                      )}
                    </div>
                  </div>

                  {balance > 0 && invoice.payUrl ? (
                    <a
                      href={invoice.payUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-4 inline-block rounded-xl bg-[#174734] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#226246]"
                    >
                      Pay Now →
                    </a>
                  ) : null}

                  {balance > 0 && !invoice.payUrl ? (
                    <p className="mt-3 text-xs text-[#6b705c]">
                      Online payment link isn&apos;t available for this
                      invoice yet — contact us to pay.
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </PortalShell>
  );
}
