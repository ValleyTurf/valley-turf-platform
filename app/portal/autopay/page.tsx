export const dynamic = "force-dynamic";
export const revalidate = 0;

// Customer portal self-serve autopay management -- the "recommended"
// enrollment path from the autopay scoping decision (the other path,
// a staff-shared link for customers who won't use the portal, lives at
// app/autopay/[token]).
import { redirect } from "next/navigation";
import { getCurrentPortalUser } from "@/lib/currentPortalUser";
import { getPaymentMethodByClientId } from "@/lib/autopay";
import { PortalShell } from "../PortalShell";
import {
  startPortalAutopaySetup,
  disablePortalAutopay,
  enablePortalAutopay,
} from "./actions";

export default async function PortalAutopayPage({
  searchParams,
}: {
  searchParams: Promise<{ setup?: string; error?: string }>;
}) {
  const customer = await getCurrentPortalUser();

  if (!customer) {
    redirect("/portal/login");
  }

  const { setup, error } = await searchParams;
  const paymentMethod = await getPaymentMethodByClientId(customer.jobberClientId);
  const hasCard = Boolean(paymentMethod?.stripePaymentMethodId);

  return (
    <PortalShell activeHref="/portal/autopay" customerName={customer.name}>
      <section className="rounded-3xl bg-white p-6 shadow">
        <h2 className="text-lg font-bold">Autopay</h2>
        <p className="mt-1 text-sm text-[#6b705c]">
          Save a card and we&apos;ll charge it automatically when a new
          invoice is ready -- no more remembering to pay. You can turn
          this off any time.
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

        <div className="mt-5 rounded-2xl border border-[#e7e2d5] p-4">
          {hasCard ? (
            <>
              <p className="font-bold">
                {paymentMethod?.cardBrand
                  ? `${paymentMethod.cardBrand.charAt(0).toUpperCase()}${paymentMethod.cardBrand.slice(1)}`
                  : "Card"}{" "}
                ending in {paymentMethod?.cardLast4 ?? "----"}
              </p>
              <p className="mt-1 text-sm text-[#6b705c]">
                Autopay is currently{" "}
                <span
                  className={
                    paymentMethod?.autopayEnabled
                      ? "font-semibold text-green-700"
                      : "font-semibold text-[#9c7a20]"
                  }
                >
                  {paymentMethod?.autopayEnabled ? "on" : "off"}
                </span>
                .
              </p>

              <div className="mt-4 flex flex-wrap gap-3">
                {paymentMethod?.autopayEnabled ? (
                  <form action={disablePortalAutopay}>
                    <button
                      type="submit"
                      className="rounded-xl border border-[#d8d3c6] bg-white px-4 py-2 text-sm font-bold text-[#6b705c] transition hover:border-[#d4af37]"
                    >
                      Turn off autopay
                    </button>
                  </form>
                ) : (
                  <form action={enablePortalAutopay}>
                    <button
                      type="submit"
                      className="rounded-xl bg-[#174734] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#226246]"
                    >
                      Turn on autopay
                    </button>
                  </form>
                )}

                <form action={startPortalAutopaySetup}>
                  <button
                    type="submit"
                    className="rounded-xl border border-[#d8d3c6] bg-white px-4 py-2 text-sm font-bold text-[#6b705c] transition hover:border-[#d4af37]"
                  >
                    Update card
                  </button>
                </form>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-[#6b705c]">
                No card on file yet.
              </p>
              <form action={startPortalAutopaySetup} className="mt-4">
                <button
                  type="submit"
                  className="rounded-xl bg-[#174734] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#226246]"
                >
                  Add a card &amp; enable autopay
                </button>
              </form>
            </>
          )}
        </div>

        <p className="mt-4 text-xs text-[#9c9990]">
          Card details are handled entirely by Stripe -- we never see or
          store your card number.
        </p>
      </section>
    </PortalShell>
  );
}
