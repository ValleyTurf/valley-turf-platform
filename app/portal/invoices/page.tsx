export const dynamic = "force-dynamic";
export const revalidate = 0;

// Invoices come from two places (Jobber-synced and native) and are merged
// by lib/portalInvoices.ts, which also hides drafts/voids and skips the
// native mirror rows so nothing is listed twice.
import { redirect } from "next/navigation";
import { getCurrentPortalUser } from "@/lib/currentPortalUser";
import { loadPortalInvoices } from "@/lib/portalInvoices";
import { formatCurrencyPrecise, formatDateOnly } from "@/lib/format";
import { PortalShell } from "../PortalShell";

export default async function PortalInvoicesPage() {
  const customer = await getCurrentPortalUser();

  if (!customer) {
    redirect("/portal/login");
  }

  const invoices = await loadPortalInvoices(customer.jobberClientId);

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
                      {invoice.balanceLabel === "due" ? (
                        <p className="text-sm font-semibold text-[#9c7a20]">
                          {formatCurrencyPrecise(balance)} due
                        </p>
                      ) : invoice.balanceLabel === "paid" ? (
                        <p className="text-sm font-semibold text-green-700">
                          Paid in full
                        </p>
                      ) : (
                        <p className="text-sm font-semibold text-[#6b705c]">
                          No balance due
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
