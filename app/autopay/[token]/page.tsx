export const dynamic = "force-dynamic";
export const revalidate = 0;

// Public, unauthenticated autopay enrollment page -- the staff-shared
// link (generated from the Customer page, see
// app/(platform)/customers/[id]/actions.ts's generateAutopayLink) for
// customers who won't log into the customer portal. Mirrors
// app/pay/[token]/page.tsx's shape and trust model (unguessable token,
// no session/cookie check).
import type { ReactNode } from "react";
import { supabaseServer } from "@/lib/supabase-server";
import { getPaymentMethodByEnrollmentToken } from "@/lib/autopay";
import { startTokenAutopaySetup } from "./actions";

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

export default async function PublicAutopayPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ setup?: string; error?: string }>;
}) {
  const { token } = await params;
  const { setup, error } = await searchParams;

  const paymentMethod = await getPaymentMethodByEnrollmentToken(token);

  if (!paymentMethod) {
    return (
      <Shell>
        <h1 className="mt-4 text-center text-2xl font-bold">Link not found</h1>
        <p className="mt-3 text-center text-[#6b705c]">
          This link doesn&apos;t match an autopay enrollment we have on
          file. Double-check the link, or contact us directly.
        </p>
      </Shell>
    );
  }

  const { data: customerRow } = await supabaseServer
    .from("customers")
    .select("full_name")
    .eq("jobber_client_id", paymentMethod.jobberClientId)
    .maybeSingle();

  const hasCard = Boolean(paymentMethod.stripePaymentMethodId);

  return (
    <Shell>
      <h1 className="mt-4 text-center text-3xl font-bold">Set Up Autopay</h1>
      <p className="mt-1 text-center text-sm text-[#6b705c]">
        {customerRow?.full_name || "Valued customer"}
      </p>

      <section className="mt-8 rounded-3xl bg-white p-6 shadow sm:p-8">
        <p className="text-sm text-[#6b705c]">
          Save a card and we&apos;ll automatically charge it when a new
          invoice is ready -- no need to remember to pay each time. You
          can turn this off any time by contacting us.
        </p>

        {setup === "1" && (
          <p className="mt-4 rounded-xl bg-green-50 p-4 text-sm font-semibold text-green-800">
            Card saved! It may take a minute to show below.
          </p>
        )}

        {error && (
          <p className="mt-4 rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-700">
            {error}
          </p>
        )}

        {hasCard && (
          <p className="mt-4 rounded-xl bg-[#f0eee6] p-4 text-sm font-semibold text-[#174734]">
            {paymentMethod.cardBrand
              ? `${paymentMethod.cardBrand.charAt(0).toUpperCase()}${paymentMethod.cardBrand.slice(1)}`
              : "Card"}{" "}
            ending in {paymentMethod.cardLast4 ?? "----"} is on file.
            Autopay is currently{" "}
            {paymentMethod.autopayEnabled ? "on" : "off"}.
          </p>
        )}

        <form action={startTokenAutopaySetup.bind(null, token)} className="mt-6">
          <button
            type="submit"
            className="w-full rounded-xl bg-[#174734] px-5 py-4 text-center text-base font-bold text-white transition hover:bg-[#226246]"
          >
            {hasCard ? "Update Card" : "Add Card & Enable Autopay"}
          </button>
        </form>

        <p className="mt-4 text-xs text-[#9c9990]">
          Card details are handled entirely by Stripe -- we never see or
          store your card number.
        </p>
      </section>
    </Shell>
  );
}
