"use client";

// One row per visit a staff member manually marked "Invoiced in Jobber"
// (see InvoiceCard.tsx's dismissAsInvoicedInJobber and migration 078's
// header comment for why this exists). A tiny client island purely for
// the Undo button -- same pattern as invoices/routing/ModeToggle.tsx.
import { useState, useTransition } from "react";
import { undoDismissVisitInvoice } from "../actions";

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export default function DismissedVisitCard({
  visitId,
  customerName,
  serviceLabel,
  completedAt,
  dismissedAt,
  dismissedByName,
}: {
  visitId: string;
  customerName: string | null;
  serviceLabel: string | null;
  completedAt: string | null;
  dismissedAt: string | null;
  dismissedByName: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [undone, setUndone] = useState(false);

  function undo() {
    setError(null);
    startTransition(async () => {
      const result = await undoDismissVisitInvoice(visitId);

      if (result.error) {
        setError(result.error);
        return;
      }

      setUndone(true);
    });
  }

  if (undone) {
    return (
      <article className="rounded-2xl bg-white p-4 shadow">
        <p className="text-sm text-[#6b705c]">
          Back on the Create Invoices list — {customerName ?? "this visit"}.
        </p>
      </article>
    );
  }

  return (
    <article className="rounded-2xl bg-white p-4 shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold">{customerName || "—"}</p>
          {serviceLabel && (
            <p className="mt-0.5 text-xs text-[#6b705c]">{serviceLabel}</p>
          )}
          <p className="mt-0.5 text-xs text-[#6b705c]">
            Visit completed {formatDateTime(completedAt)}
          </p>
          <p className="mt-1 text-xs font-semibold text-[#9c7a20]">
            Marked invoiced in Jobber {formatDateTime(dismissedAt)}
            {dismissedByName ? ` by ${dismissedByName}` : ""}
          </p>
        </div>

        <button
          type="button"
          disabled={isPending}
          onClick={undo}
          className="shrink-0 rounded-xl border border-[#174734] px-3 py-2 text-xs font-bold transition hover:bg-[#f7f6f1] disabled:opacity-60"
        >
          {isPending ? "Undoing…" : "Undo"}
        </button>
      </div>

      {error && <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>}
    </article>
  );
}
