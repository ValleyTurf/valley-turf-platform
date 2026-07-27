export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import CopyLinkButton from "@/app/components/CopyLinkButton";
import ConfirmSubmitButton from "@/app/components/ConfirmSubmitButton";
import { formatCurrency, formatDateOnly } from "@/lib/format";
import {
  computeDisplayStatus,
  quoteStatusLabel,
  allowedStatusTransitions,
  canEditQuote,
  isQuoteStatus,
  type QuoteStatus,
} from "@/lib/quotes";
import {
  markQuoteStatus,
  deleteDraftQuote,
  retryQuoteJobConversion,
} from "../actions";

type QuoteDetail = {
  id: string;
  quote_number: number;
  customer_id: string | null;
  lead_id: string | null;
  recipient_name: string;
  recipient_email: string | null;
  recipient_phone: string | null;
  recipient_address: string | null;
  service_category: string | null;
  description: string;
  price_total: number | string;
  status: QuoteStatus;
  expires_at: string | null;
  viewed_at: string | null;
  responded_at: string | null;
  response_note: string | null;
  public_token: string;
  created_by_name: string | null;
  created_at: string;
  jobber_job_id: string | null;
  jobber_job_number: string | null;
  job_creation_error: string | null;
  job_creation_attempted_at: string | null;
};

const STATUS_BADGE_CLASSES: Record<QuoteStatus, string> = {
  draft: "bg-[#f0eee6] text-[#6b705c]",
  sent: "bg-blue-50 text-blue-800",
  accepted: "bg-green-50 text-green-800",
  declined: "bg-red-50 text-red-700",
  expired: "bg-amber-50 text-amber-800",
};

const STATUS_BUTTON_LABEL: Record<QuoteStatus, string> = {
  draft: "Reopen as Draft",
  sent: "Mark Sent",
  accepted: "Mark Accepted",
  declined: "Mark Declined",
  expired: "Mark Expired",
};

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data, error } = await supabaseServer
    .from("quotes")
    .select(
      "id, quote_number, customer_id, lead_id, recipient_name, recipient_email, recipient_phone, recipient_address, service_category, description, price_total, status, expires_at, viewed_at, responded_at, response_note, public_token, created_by_name, created_at, jobber_job_id, jobber_job_number, job_creation_error, job_creation_attempted_at"
    )
    .eq("id", id)
    .single();

  if (error || !data) {
    notFound();
  }

  const quote = data as QuoteDetail;

  if (!isQuoteStatus(quote.status)) {
    notFound();
  }

  const displayStatus = computeDisplayStatus(quote.status, quote.expires_at);
  const transitions = allowedStatusTransitions(quote.status);
  const shareUrl = `https://go.valleyturfrevival.com/q/${quote.public_token}`;

  return (
    <main className="min-h-screen bg-[#f5f4ef] px-4 py-6 text-[#174734] sm:px-6 sm:py-8">
      <div className="mx-auto max-w-3xl">
        <header className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
              Quote #{quote.quote_number}
            </p>
            <h1 className="mt-2 text-3xl font-bold sm:text-4xl">
              {quote.recipient_name}
            </h1>
            <span
              className={`mt-3 inline-block rounded-full px-3 py-1 text-xs font-bold ${STATUS_BADGE_CLASSES[displayStatus]}`}
            >
              {quoteStatusLabel(displayStatus)}
            </span>
          </div>

          <Link
            href="/quotes"
            className="rounded-xl border border-[#174734] px-5 py-3 text-center text-sm font-bold transition hover:bg-white"
          >
            Back to Quotes
          </Link>
        </header>

        <section className="mt-6 rounded-2xl bg-white p-5 shadow sm:p-8">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-bold text-[#9c7a20]">Price</p>
              <p className="mt-1 text-2xl font-bold">
                {formatCurrency(quote.price_total)}
              </p>
            </div>
            <div>
              <p className="text-xs font-bold text-[#9c7a20]">
                Service Category
              </p>
              <p className="mt-1">{quote.service_category || "General"}</p>
            </div>
            <div>
              <p className="text-xs font-bold text-[#9c7a20]">Contact</p>
              <p className="mt-1">{quote.recipient_email || "—"}</p>
              <p>{quote.recipient_phone || "—"}</p>
              {quote.customer_id && (
                <Link
                  href={`/customers/${encodeURIComponent(quote.customer_id)}`}
                  className="mt-1 inline-block text-xs font-semibold text-[#9c7a20] hover:underline"
                >
                  View customer record →
                </Link>
              )}
            </div>
            <div>
              <p className="text-xs font-bold text-[#9c7a20]">Address</p>
              <p className="mt-1">{quote.recipient_address || "—"}</p>
            </div>
            <div>
              <p className="text-xs font-bold text-[#9c7a20]">Valid Until</p>
              <p className="mt-1">
                {quote.expires_at ? formatDateOnly(quote.expires_at) : "No expiration"}
              </p>
            </div>
            <div>
              <p className="text-xs font-bold text-[#9c7a20]">Created</p>
              <p className="mt-1">
                {formatDateOnly(quote.created_at)}
                {quote.created_by_name ? ` by ${quote.created_by_name}` : ""}
              </p>
            </div>
          </div>

          <div className="mt-6 border-t border-[#eee9dc] pt-6">
            <p className="text-xs font-bold text-[#9c7a20]">Description</p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-[#174734]">
              {quote.description}
            </p>
          </div>

          {(quote.viewed_at || quote.responded_at || quote.response_note) && (
            <div className="mt-6 space-y-1 border-t border-[#eee9dc] pt-6 text-sm text-[#6b705c]">
              {quote.viewed_at && (
                <p>Customer first viewed this on {formatDateOnly(quote.viewed_at)}.</p>
              )}
              {quote.responded_at && (
                <p>Responded on {formatDateOnly(quote.responded_at)}.</p>
              )}
              {quote.response_note && (
                <p className="italic">&ldquo;{quote.response_note}&rdquo;</p>
              )}
            </div>
          )}
        </section>

        <section className="mt-6 rounded-2xl bg-white p-5 shadow">
          <p className="text-xs font-bold text-[#9c7a20]">Shareable Link</p>
          <p className="mt-1 break-all text-sm">{shareUrl}</p>
          <div className="mt-3">
            <CopyLinkButton
              url={shareUrl}
              className="rounded-xl border border-[#174734] px-4 py-2 text-sm font-semibold text-[#174734] shadow-sm transition hover:bg-[#174734] hover:text-white"
            />
          </div>
        </section>

        {quote.status === "accepted" && (
          <section className="mt-6 rounded-2xl bg-white p-5 shadow">
            <p className="text-xs font-bold text-[#9c7a20]">Jobber Job</p>

            {quote.jobber_job_id ? (
              <div className="mt-2 rounded-xl bg-green-50 p-4 text-sm text-green-800">
                <p className="font-bold">
                  Job {quote.jobber_job_number ? `#${quote.jobber_job_number}` : ""}{" "}
                  created in Jobber
                </p>
                {quote.job_creation_attempted_at && (
                  <p className="mt-1 text-green-700">
                    {formatDateOnly(quote.job_creation_attempted_at)}
                  </p>
                )}
              </div>
            ) : (
              <div className="mt-2 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
                <p className="font-bold">
                  {quote.job_creation_error
                    ? "Job creation failed"
                    : "Job hasn't been created in Jobber yet"}
                </p>
                {quote.job_creation_error && (
                  <p className="mt-1 text-amber-700">{quote.job_creation_error}</p>
                )}
                <form
                  action={retryQuoteJobConversion.bind(null, quote.id)}
                  className="mt-3"
                >
                  <button
                    type="submit"
                    className="rounded-lg bg-[#174734] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#226246]"
                  >
                    {quote.job_creation_error ? "Retry" : "Create Job in Jobber"}
                  </button>
                </form>
              </div>
            )}
          </section>
        )}

        {(transitions.length > 0 || canEditQuote(quote.status)) && (
          <section className="mt-6 rounded-2xl bg-white p-5 shadow">
            <p className="text-xs font-bold text-[#9c7a20]">Update Status</p>
            <div className="mt-3 flex flex-wrap gap-3">
              {transitions.map((nextStatus) => (
                <form
                  key={nextStatus}
                  action={markQuoteStatus.bind(null, quote.id, nextStatus)}
                >
                  <button
                    type="submit"
                    className="rounded-xl bg-[#174734] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#226246]"
                  >
                    {STATUS_BUTTON_LABEL[nextStatus]}
                  </button>
                </form>
              ))}

              {canEditQuote(quote.status) && (
                <form action={deleteDraftQuote.bind(null, quote.id)}>
                  <ConfirmSubmitButton
                    confirmMessage="Delete this draft quote? This can't be undone."
                    className="rounded-xl border border-red-300 px-4 py-2 text-sm font-bold text-red-700 transition hover:bg-red-50"
                  >
                    Delete Draft
                  </ConfirmSubmitButton>
                </form>
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
