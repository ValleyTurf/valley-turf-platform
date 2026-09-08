export const dynamic = "force-dynamic";
export const revalidate = 0;

// Public, unauthenticated visit-confirmation page -- the link sent in
// the 4-day/2-day reminder text and email (lib/notifications.ts). Same
// unguessable-token trust model and Shell as /q/[token] and /pay/[token].
import type { ReactNode } from "react";
import { getVisitByConfirmationToken } from "@/lib/visitConfirmation";
import { confirmVisit } from "./actions";

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

// Visit titles follow the "{Customer} - {Service}" convention used
// throughout this app -- strip the customer name back off for a cleaner
// "Turf Cleaning visit" line, same approach as lib/visitReminders.ts's
// (now-removed) visitLabel(), kept small and local here rather than
// shared since this is the only remaining place that needs it.
function serviceLabel(title: string | null, customerName: string | null): string {
  if (!title) return "visit";

  if (customerName) {
    const prefix = `${customerName} - `;
    if (title.startsWith(prefix)) {
      return title.slice(prefix.length);
    }
  }

  return title;
}

function formatVisitDateTime(startAt: string | null): string {
  if (!startAt) return "your scheduled date";

  const date = new Date(startAt);
  if (Number.isNaN(date.getTime())) return "your scheduled date";

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    weekday: "long",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export default async function ConfirmVisitPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error } = await searchParams;

  const visit = await getVisitByConfirmationToken(token);

  if (!visit) {
    return (
      <Shell>
        <h1 className="mt-4 text-center text-2xl font-bold">Link not found</h1>
        <p className="mt-3 text-center text-[#6b705c]">
          This confirmation link doesn&apos;t match a visit we have on file.
          Double-check the link, or contact us directly.
        </p>
      </Shell>
    );
  }

  const label = serviceLabel(visit.title, visit.customer_name);
  const dateLabel = formatVisitDateTime(visit.start_at);

  return (
    <Shell>
      <h1 className="mt-4 text-center text-3xl font-bold">
        {visit.confirmed_at ? "Visit Confirmed" : "Confirm Your Visit"}
      </h1>

      <section className="mt-8 rounded-3xl bg-white p-6 shadow sm:p-8 text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-[#9c7a20]">
          {label}
        </p>
        <p className="mt-2 text-xl font-bold">{dateLabel}</p>

        {error === "1" && (
          <p className="mt-4 rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-700">
            That didn&apos;t go through. Refresh and try again, or contact us
            directly.
          </p>
        )}

        {visit.confirmed_at ? (
          <p className="mt-6 rounded-xl bg-green-50 p-4 text-sm font-semibold text-green-800">
            ✓ You&apos;re all set — thanks for confirming!
          </p>
        ) : (
          <form action={confirmVisit.bind(null, token)} className="mt-6">
            <button
              type="submit"
              className="w-full rounded-xl bg-[#174734] px-5 py-4 text-center text-base font-bold text-white transition hover:bg-[#226246]"
            >
              Confirm My Visit
            </button>
          </form>
        )}

        <p className="mt-4 text-xs text-[#6b705c]">
          Need to reschedule instead? Reply to the text or email you got, or
          give us a call.
        </p>
      </section>
    </Shell>
  );
}
