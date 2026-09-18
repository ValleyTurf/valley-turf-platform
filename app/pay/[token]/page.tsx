export const dynamic = "force-dynamic";
export const revalidate = 0;

// Public, unauthenticated invoice + Pay Now page -- the stable link
// that actually gets emailed/texted to customers (lib/invoices.ts's
// publicToken), instead of a raw Stripe Checkout Session URL that
// expires ~24h after creation. Mirrors app/q/[token]/page.tsx's shape
// and trust model (unguessable token, no session/cookie check).
import type { ReactNode } from "react";
import { supabaseServer } from "@/lib/supabase-server";
import { formatCurrencyPrecise, formatDateOnly } from "@/lib/format";
import { getOrCreateEnrollmentToken } from "@/lib/autopay";
import { getBaseUrl } from "@/lib/baseUrl";
import { payInvoice } from "./actions";
import { TipSelector } from "./TipSelector";

type PublicInvoice = {
  id: string;
  invoice_number: string;
  customer_name: string | null;
  status: string;
  total: number | string;
  issue_date: string | null;
  due_date: string | null;
  message: string | null;
  paid_at: string | null;
  jobber_client_id: string | null;
};

type PublicLineItem = {
  id: string;
  description: string;
  quantity: number | string;
  unit_price: number | string;
  line_total: number | string;
};

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-[#f5f4ef] px-4 py-10 text-[#174734] sm:px-6">
      <div className="mx-auto max-w-xl">
        <p className="text-center text-sm font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
          Valley Turf Revival
        </p>
        {children}
      </div>
    </main>
  );
}

const ERROR_MESSAGES: Record<string, string> = {
  not_found: "This link doesn't match an invoice we have on file.",
  not_payable: "This invoice isn't open for payment right now.",
  invalid_amount: "This invoice doesn't have a valid amount to charge.",
};

export default async function PublicInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ paid?: string; error?: string }>;
}) {
  const { token } = await params;
  const { paid, error: errorCode } = await searchParams;

  const { data, error } = await supabaseServer
    .from("invoices")
    .select(
      "id, invoice_number, customer_name, status, total, issue_date, due_date, message, paid_at, jobber_client_id"
    )
    .eq("public_token", token)
    .single();

  if (error || !data) {
    return (
      <Shell>
        <h1 className="mt-4 text-center text-2xl font-bold">
          Invoice not found
        </h1>
        <p className="mt-3 text-center text-[#6b705c]">
          This link doesn&apos;t match an invoice we have on file.
          Double-check the link, or contact us directly.
        </p>
      </Shell>
    );
  }

  const invoice = data as PublicInvoice;

  const { data: lineItemRows } = await supabaseServer
    .from("invoice_line_items")
    .select("id, description, quantity, unit_price, line_total")
    .eq("invoice_id", invoice.id)
    .order("created_at", { ascending: true });

  const lineItems = (lineItemRows ?? []) as PublicLineItem[];
  const isPayable = invoice.status === "sent" || invoice.status === "overdue";

  // Ryan (2026-09-18): offer autopay enrollment right on the payment
  // page too, not just in the email/SMS that linked here -- covers
  // whichever channel actually brought the customer, and gives paid
  // invoices a place to nudge toward autopay for next time. Skipped for
  // draft (not a real invoice relationship yet) and void. Same public,
  // unauthenticated /autopay/[token] page as the email/SMS CTA
  // (app/(platform)/invoices/actions.ts) -- it already shows the right
  // state (enroll vs. update card) on its own.
  const showAutopayCta =
    invoice.jobber_client_id &&
    invoice.status !== "draft" &&
    invoice.status !== "void";

  let autopayUrl: string | null = null;

  if (showAutopayCta) {
    const enrollment = await getOrCreateEnrollmentToken(
      invoice.jobber_client_id as string
    );

    if (enrollment.ok) {
      const baseUrl = await getBaseUrl();
      autopayUrl = `${baseUrl}/autopay/${enrollment.token}`;
    }
  }

  return (
    <Shell>
      <h1 className="mt-4 text-center text-3xl font-bold">
        Invoice {invoice.invoice_number}
      </h1>
      <p className="mt-1 text-center text-sm text-[#6b705c]">
        {invoice.customer_name || "Valued customer"}
      </p>

      <section className="mt-8 rounded-3xl bg-white p-6 shadow sm:p-8">
        {lineItems.length > 0 && (
          <div className="space-y-3 border-b border-[#eee9dc] pb-4">
            {lineItems.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-4 text-sm">
                <div>
                  <p className="font-semibold">{item.description}</p>
                  <p className="text-[#6b705c]">
                    {item.quantity} &times; {formatCurrencyPrecise(item.unit_price)}
                  </p>
                </div>
                <p className="shrink-0 font-semibold">
                  {formatCurrencyPrecise(item.line_total)}
                </p>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 flex items-center justify-between">
          <p className="text-lg font-bold">Total</p>
          <p className="text-3xl font-bold">{formatCurrencyPrecise(invoice.total)}</p>
        </div>

        {invoice.due_date && (
          <p className="mt-3 text-sm text-[#6b705c]">
            Due {formatDateOnly(invoice.due_date)}
          </p>
        )}

        {invoice.message && (
          <p className="mt-4 whitespace-pre-wrap text-sm text-[#174734]">
            {invoice.message}
          </p>
        )}
      </section>

      {paid === "1" && invoice.status !== "paid" && (
        <p className="mt-6 rounded-xl bg-green-50 p-4 text-center text-sm font-semibold text-green-800">
          Thanks for your payment! It may take a minute to show as paid
          here.
        </p>
      )}

      {errorCode && (
        <p className="mt-6 rounded-xl bg-red-50 p-4 text-center text-sm font-semibold text-red-700">
          {ERROR_MESSAGES[errorCode] || errorCode}
        </p>
      )}

      {invoice.status === "paid" && (
        <p className="mt-6 rounded-xl bg-green-50 p-4 text-center text-sm font-semibold text-green-800">
          This invoice has been paid. Thank you!
        </p>
      )}

      {invoice.status === "void" && (
        <p className="mt-6 rounded-xl bg-[#f0eee6] p-4 text-center text-sm font-semibold text-[#6b705c]">
          This invoice has been voided.
        </p>
      )}

      {invoice.status === "draft" && (
        <p className="mt-6 rounded-xl bg-amber-50 p-4 text-center text-sm font-semibold text-amber-800">
          This invoice isn&apos;t ready to view yet. Please contact us if
          you were sent this link.
        </p>
      )}

      {isPayable && (
        <form action={payInvoice.bind(null, token)} className="mt-6">
          <TipSelector invoiceTotal={Number(invoice.total)} />
          <button
            type="submit"
            className="mt-4 w-full rounded-xl bg-[#174734] px-5 py-4 text-center text-base font-bold text-white transition hover:bg-[#226246]"
          >
            Pay Now
          </button>
        </form>
      )}

      {autopayUrl && (
        <p className="mt-4 text-center text-sm text-[#6b705c]">
          <a
            href={autopayUrl}
            className="font-semibold text-[#174734] underline"
          >
            Set up Autopay
          </a>{" "}
          so we can charge future invoices automatically.
        </p>
      )}
    </Shell>
  );
}
