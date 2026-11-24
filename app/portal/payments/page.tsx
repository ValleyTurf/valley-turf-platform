export const dynamic = "force-dynamic";
export const revalidate = 0;

// Payment history: every payment on the account, any refund against it,
// and a downloadable PDF receipt. Answers "did my payment go through?"
// without a phone call.
import { redirect } from "next/navigation";
import { getCurrentPortalUser } from "@/lib/currentPortalUser";
import { loadPortalPayments } from "@/lib/portalPayments";
import { paymentStateLabel, receiptNumber } from "@/lib/portalPaymentsLogic";
import { formatCurrencyPrecise, formatDateOnly } from "@/lib/format";
import { PortalShell } from "../PortalShell";

const STATE_STYLE: Record<string, string> = {
  paid: "bg-[#e6f0e9] text-[#174734]",
  partially_refunded: "bg-[#fdf3dc] text-[#7a5a12]",
  refunded: "bg-[#f1eee4] text-[#6b705c]",
  refund: "bg-[#f1eee4] text-[#6b705c]",
  failed: "bg-[#fbe9e7] text-[#9a2f22]",
};

export default async function PortalPaymentsPage() {
  const customer = await getCurrentPortalUser();

  if (!customer) {
    redirect("/portal/login");
  }

  const payments = await loadPortalPayments(customer.jobberClientId);

  return (
    <PortalShell activeHref="/portal/payments" customerName={customer.name}>
      <section className="rounded-3xl bg-white p-6 shadow">
        <h2 className="text-lg font-bold">Payment History</h2>
        <p className="mt-1 text-sm text-[#6b705c]">
          Every payment we&apos;ve received, with a receipt you can download.
        </p>

        {payments.length === 0 ? (
          <p className="mt-4 rounded-2xl bg-[#f7f6f1] p-4 text-sm text-[#6b705c]">
            No payments on your account yet.
          </p>
        ) : (
          <div className="mt-5 space-y-3">
            {payments.map((payment) => (
              <div key={payment.id} className="rounded-2xl border border-[#e7e2d5] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-bold">
                      {payment.state === "refund" ? "Refund" : "Payment"}
                      {payment.invoiceNumber ? ` · Invoice #${payment.invoiceNumber}` : ""}
                    </p>
                    <p className="mt-1 text-sm text-[#6b705c]">
                      {formatDateOnly(payment.date)} · {payment.methodLabel}
                    </p>
                    {payment.tip > 0 ? (
                      <p className="mt-1 text-sm text-[#6b705c]">
                        Includes {formatCurrencyPrecise(payment.tip)} tip
                      </p>
                    ) : null}
                  </div>

                  <div className="text-right">
                    <p className="text-lg font-bold">
                      {payment.state === "refund" ? "-" : ""}
                      {formatCurrencyPrecise(payment.amount)}
                    </p>
                    <span
                      className={`mt-1 inline-block rounded-full px-3 py-1 text-xs font-bold ${
                        STATE_STYLE[payment.state] ?? STATE_STYLE.paid
                      }`}
                    >
                      {paymentStateLabel(payment.state)}
                    </span>
                  </div>
                </div>

                {payment.refundedAmount > 0 && payment.state !== "refund" ? (
                  <p className="mt-2 text-sm text-[#6b705c]">
                    {formatCurrencyPrecise(payment.refundedAmount)} of this was refunded to your original payment method.
                  </p>
                ) : null}

                {payment.state === "failed" ? (
                  <p className="mt-2 text-sm text-[#9a2f22]">
                    This attempt didn&apos;t go through, so you were not charged. Give us a call and we&apos;ll sort it out.
                  </p>
                ) : null}

                {payment.receiptAvailable ? (
                  <a
                    href={`/portal/receipts/${encodeURIComponent(payment.id)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-block rounded-full border border-[#174734] px-4 py-2 text-sm font-bold text-[#174734]"
                  >
                    Download receipt ({receiptNumber(payment.id)})
                  </a>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </PortalShell>
  );
}
