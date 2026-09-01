"use client";

// One card per completed-but-not-yet-invoiced visit. A client island
// (not a plain <form action>) for the same reason my-day's VisitTimer
// is: needs inline error/success feedback without a full page
// navigation, and calls the Server Action directly via useTransition.
import { useState, useTransition } from "react";
import { createInvoice } from "./actions";

const DUE_OPTIONS: { label: string; value: number }[] = [
  { label: "Due on Receipt", value: 0 },
  { label: "Net 15", value: 15 },
  { label: "Net 30", value: 30 },
  { label: "Net 60", value: 60 },
];

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

export type ReadyToInvoiceVisit = {
  jobber_visit_id: string;
  jobber_client_id: string | null;
  customer_name: string | null;
  job_number: string | null;
  title: string | null;
  start_at: string | null;
  completed_at: string | null;
};

function formatDate(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

// Same "{Customer} - {Service}" convention used on /schedule, /my-day,
// and /job-costs — strip the leading customer segment so the default
// line item name reads as a service, not a repeat of the customer name.
function visitServiceLabel(title: string | null): string | null {
  const trimmed = (title ?? "").trim();
  if (!trimmed) return null;

  const separatorIndex = trimmed.indexOf(" - ");
  if (separatorIndex === -1) return trimmed;

  const service = trimmed.slice(separatorIndex + 3).trim();
  return service || trimmed;
}

export default function InvoiceCard({
  visit,
  directCost,
  suggestedPrice,
}: {
  visit: ReadyToInvoiceVisit;
  directCost: number;
  suggestedPrice: number | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    invoiceNumber: string | null;
    jobberWebUri: string | null;
    autopayCharged?: boolean;
    delivered?: boolean;
  } | null>(null);

  const defaultTitle = visitServiceLabel(visit.title) ?? "Service";
  const [title, setTitle] = useState(defaultTitle);
  const [price, setPrice] = useState(
    suggestedPrice != null && suggestedPrice > 0 ? String(suggestedPrice) : ""
  );
  const [subject, setSubject] = useState(
    `${visit.customer_name ?? "Customer"} — ${defaultTitle}`
  );
  const [dueNetDays, setDueNetDays] = useState(15);

  function submit(markSent: boolean) {
    setError(null);

    const parsedPrice = Number(price);
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      setError("Enter a valid price.");
      return;
    }

    if (!visit.jobber_client_id) {
      setError("This visit has no linked customer — can't invoice it here.");
      return;
    }

    startTransition(async () => {
      const result = await createInvoice({
        visitId: visit.jobber_visit_id,
        clientId: visit.jobber_client_id!,
        customerName: visit.customer_name,
        title,
        price: parsedPrice,
        cost: directCost > 0 ? directCost : null,
        subject,
        dueNetDays,
        markSent,
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      setSuccess({
        invoiceNumber: result.invoiceNumber,
        jobberWebUri: result.jobberWebUri,
        autopayCharged: result.autopayCharged,
        delivered: result.delivered,
      });
    });
  }

  if (success) {
    return (
      <article className="rounded-2xl border border-green-200 bg-green-50 p-4 shadow">
        <p className="font-bold text-green-800">
          Invoice {success.invoiceNumber ? `#${success.invoiceNumber}` : ""}{" "}
          created
        </p>
        <p className="mt-1 text-sm text-green-700">
          {visit.customer_name} — {title}
        </p>
        {success.autopayCharged && (
          <p className="mt-2 text-xs font-semibold text-green-800">
            Charged automatically via autopay — a receipt was sent.
          </p>
        )}
        {!success.autopayCharged && success.delivered && (
          <p className="mt-2 text-xs font-semibold text-green-800">
            Sent to the customer by email/text.
          </p>
        )}
        {!success.autopayCharged && success.delivered === false && (
          <p className="mt-2 text-xs font-semibold text-amber-700">
            Invoice created, but delivery failed — check the customer&apos;s email/phone on file.
          </p>
        )}
        {success.jobberWebUri && (
          <a
            href={success.jobberWebUri}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-sm font-semibold text-green-800 underline"
          >
            View in Jobber →
          </a>
        )}
      </article>
    );
  }

  return (
    <article className="rounded-2xl bg-white p-4 shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold">{visit.customer_name || "—"}</p>
          <p className="mt-0.5 text-xs text-[#6b705c]">
            {formatDate(visit.completed_at ?? visit.start_at)}
            {visit.job_number ? ` · Job #${visit.job_number}` : ""}
          </p>
          {visitServiceLabel(visit.title) && (
            <p className="text-xs text-[#6b705c]">
              {visitServiceLabel(visit.title)}
            </p>
          )}
        </div>

        {directCost > 0 && (
          <span className="shrink-0 rounded-full bg-[#f0f0ec] px-2 py-1 text-[10px] font-bold text-[#6b705c]">
            Direct cost {formatCurrency(directCost)}
          </span>
        )}
      </div>

      {!expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-3 w-full rounded-xl border border-[#174734] px-4 py-2.5 text-sm font-bold transition hover:bg-[#f7f6f1]"
        >
          Create Invoice
        </button>
      ) : (
        <div className="mt-3 space-y-3 border-t border-[#f0eee6] pt-3">
          <label className="block">
            <span className="text-xs font-bold text-[#9c7a20]">
              Line item
            </span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2.5 text-base outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
            />
          </label>

          <label className="block">
            <span className="text-xs font-bold text-[#9c7a20]">Price</span>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.00"
              className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2.5 text-base outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
            />
            {suggestedPrice != null && suggestedPrice > 0 && (
              <span className="mt-1 block text-[10px] text-[#6b705c]">
                Suggested from the job&apos;s price: {formatCurrency(suggestedPrice)}
              </span>
            )}
          </label>

          <label className="block">
            <span className="text-xs font-bold text-[#9c7a20]">Subject</span>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2.5 text-base outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
            />
          </label>

          <label className="block">
            <span className="text-xs font-bold text-[#9c7a20]">Due</span>
            <select
              value={dueNetDays}
              onChange={(e) => setDueNetDays(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-[#d9d4c6] bg-white px-3 py-2.5 text-base outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
            >
              {DUE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          {error && (
            <p className="text-xs font-semibold text-red-600">{error}</p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={() => submit(false)}
              className="flex-1 rounded-xl border border-[#174734] px-4 py-2.5 text-sm font-bold transition hover:bg-[#f7f6f1] disabled:opacity-60"
            >
              {isPending ? "Saving…" : "Save Draft"}
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => submit(true)}
              className="flex-1 rounded-xl bg-[#174734] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#226246] disabled:opacity-60"
            >
              {isPending ? "Sending…" : "Create & Send"}
            </button>
          </div>

          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="w-full text-center text-xs font-semibold text-[#9c7a20] hover:underline"
          >
            Cancel
          </button>
        </div>
      )}
    </article>
  );
}
