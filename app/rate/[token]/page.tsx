export const dynamic = "force-dynamic";
export const revalidate = 0;

// Public, unauthenticated post-visit rating page -- the link a star
// click in the invoice email lands on (lib/notifications.ts's
// sendInvoiceEmail reviewBlock), reusing the invoice's own public_token
// (lib/invoiceRatings.ts) the same way /pay/[token] does. Mirrors
// app/pay/[token]/page.tsx's shape and trust model (unguessable token,
// no session/cookie check).
//
// Deliberately a two-step flow: the email's star links only pick a
// score via ?score=N (a plain GET, no side effects yet); this page then
// shows a Confirm button, and only THAT submit (app/rate/[token]/
// actions.ts's submitRating) actually records anything. See
// lib/invoiceRatings.ts's comment on submitInvoiceRating for why.
import type { ReactNode } from "react";
import { getInvoiceForRating } from "@/lib/invoiceRatings";
import { submitRating } from "./actions";

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-[#f5f4ef] px-4 py-10 text-[#174734] sm:px-6">
      <div className="mx-auto max-w-xl text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
          Valley Turf Revival
        </p>
        {children}
      </div>
    </main>
  );
}

const STAR_LABELS: Record<number, string> = {
  1: "Poor",
  2: "Fair",
  3: "OK",
  4: "Good",
  5: "Great",
};

const ERROR_MESSAGES: Record<string, string> = {
  not_found: "This link doesn't match an invoice we have on file.",
  invalid_score: "That rating wasn't valid -- please pick a star rating below.",
};

function StarLinks({ token, selected }: { token: string; selected?: number }) {
  return (
    <div className="mt-6 flex justify-center gap-2">
      {[1, 2, 3, 4, 5].map((n) => (
        <a
          key={n}
          href={`/rate/${token}?score=${n}`}
          className={`rounded-lg px-4 py-3 text-lg font-semibold shadow transition ${
            n === selected
              ? "bg-[#174734] text-white"
              : "bg-white text-[#174734] hover:bg-[#174734] hover:text-white"
          }`}
        >
          {n}&#9733;
        </a>
      ))}
    </div>
  );
}

export default async function RateInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ score?: string; done?: string; error?: string }>;
}) {
  const { token } = await params;
  const { score: scoreParam, done, error: errorCode } = await searchParams;

  const invoice = await getInvoiceForRating(token);

  if (!invoice) {
    return (
      <Shell>
        <h1 className="mt-4 text-2xl font-bold">Rating link not found</h1>
        <p className="mt-3 text-[#6b705c]">
          {ERROR_MESSAGES.not_found} Double-check the link, or contact us
          directly.
        </p>
      </Shell>
    );
  }

  const greetingName = invoice.customerName || "there";

  if (done === "1") {
    return (
      <Shell>
        <h1 className="mt-4 text-2xl font-bold">Thanks, {greetingName}!</h1>
        <p className="mt-3 text-[#6b705c]">
          We appreciate you letting us know. If anything about your last
          visit wasn&apos;t right, we&apos;ll be in touch.
        </p>
      </Shell>
    );
  }

  const selectedScore = Number(scoreParam);
  const hasValidSelection =
    Number.isInteger(selectedScore) && selectedScore >= 1 && selectedScore <= 5;

  const errorBanner = errorCode ? (
    <p className="mt-4 rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-700">
      {ERROR_MESSAGES[errorCode] || "Something went wrong -- please try again."}
    </p>
  ) : null;

  if (hasValidSelection) {
    return (
      <Shell>
        <h1 className="mt-4 text-2xl font-bold">Confirm your rating</h1>
        <p className="mt-3 text-[#6b705c]">
          You selected {selectedScore} of 5 stars ({STAR_LABELS[selectedScore]})
          for invoice {invoice.invoiceNumber}.
        </p>
        {errorBanner}
        <form action={submitRating.bind(null, token, selectedScore)} className="mt-6">
          <button
            type="submit"
            className="w-full rounded-xl bg-[#174734] px-5 py-4 text-base font-bold text-white transition hover:bg-[#226246]"
          >
            Confirm {selectedScore}-star rating
          </button>
        </form>
        <StarLinks token={token} selected={selectedScore} />
        <p className="mt-3 text-xs text-[#6b705c]">
          Picked the wrong one? Tap a different number above, then Confirm.
        </p>
      </Shell>
    );
  }

  if (invoice.existingScore) {
    return (
      <Shell>
        <h1 className="mt-4 text-2xl font-bold">Thanks, {greetingName}!</h1>
        <p className="mt-3 text-[#6b705c]">
          You already rated invoice {invoice.invoiceNumber}{" "}
          {invoice.existingScore} of 5 stars.
        </p>
        {errorBanner}
        <StarLinks token={token} />
        <p className="mt-3 text-xs text-[#6b705c]">
          Want to change it? Tap a different number above.
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="mt-4 text-2xl font-bold">How did we do, {greetingName}?</h1>
      <p className="mt-3 text-[#6b705c]">
        Tap a star to rate your last visit (invoice {invoice.invoiceNumber}).
      </p>
      {errorBanner}
      <StarLinks token={token} />
    </Shell>
  );
}
