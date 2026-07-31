export const dynamic = "force-dynamic";
export const revalidate = 0;

import { redirect } from "next/navigation";
import { getCurrentPortalUser } from "@/lib/currentPortalUser";
import { supabaseServer } from "@/lib/supabase-server";
import { formatCurrency, formatDateOnly } from "@/lib/format";
import { PortalShell } from "../PortalShell";

type PortalInvoice = {
  jobber_invoice_id: string;
  invoice_number: string | null;
  status: string | null;
  issue_date: string | null;
  due_date: string | null;
  total: number | string;
  balance: number | string;
  jobber_web_uri: string | null;
};

export default async function PortalInvoicesPage() {
  const customer = await getCurrentPortalUser();

  if (!customer) {
    redirect("/portal/login");
  }

  const { data, error } = await supabaseServer
    .from("jobber_invoices")
    .select(
      "jobber_invoice_id, invoice_number, status, issue_date, due_date, total, balance, jobber_web_uri"
    )
    .eq("jobber_client_id", customer.jobberClientId)
    .order("issue_date", { ascending: false })
    .limit(50);

  const invoices = (error ? [] : data ?? []) as PortalInvoice[];

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
              const balance = Number(invoice.balance ?? 0);

              return (
                <div
                  key={invoice.jobber_invoice_id}
                  className="rounded-2xl border border-[#e7e2d5] p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-bold">
                        Invoice #{invoice.invoice_number || "—"}
                      </p>
                      <p className="mt-1 text-sm text-[#6b705c]">
                        Issued {formatDateOnly(invoice.issue_date)}
                        {invoice.due_date
                          ? ` · Due ${formatDateOnly(invoice.due_date)}`
                          : ""}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-lg font-bold">
                        {formatCurrency(invoice.total)}
                      </p>
                      {balance > 0 ? (
                        <p className="text-sm font-semibold text-[#9c7a20]">
                          {formatCurrency(balance)} due
                        </p>
                      ) : (
                        <p className="text-sm font-semibold text-green-700">
                          Paid in full
                        </p>
                      )}
                    </div>
                  </div>

                  {balance > 0 && invoice.jobber_web_uri ? (
                    <a
                      href={invoice.jobber_web_uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-4 inline-block rounded-xl bg-[#174734] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#226246]"
                    >
                      Pay Now →
                    </a>
                  ) : null}

                  {balance > 0 && !invoice.jobber_web_uri ? (
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
