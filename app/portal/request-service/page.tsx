export const dynamic = "force-dynamic";
export const revalidate = 0;

import { redirect } from "next/navigation";
import { getCurrentPortalUser } from "@/lib/currentPortalUser";
import { PortalShell } from "../PortalShell";
import { submitServiceRequest } from "./actions";

export default async function PortalRequestServicePage({
  searchParams,
}: {
  searchParams: Promise<{ result?: string }>;
}) {
  const customer = await getCurrentPortalUser();

  if (!customer) {
    redirect("/portal/login");
  }

  const { result } = await searchParams;

  return (
    <PortalShell activeHref="/portal/request-service" customerName={customer.name}>
      <section className="rounded-3xl bg-white p-6 shadow">
        <h2 className="text-lg font-bold">Request Service</h2>
        <p className="mt-1 text-sm text-[#6b705c]">
          Tell us what you need — this isn&apos;t an automatic booking, our
          office will follow up to get it scheduled.
        </p>

        {result === "sent" && (
          <p className="mt-4 rounded-xl bg-green-50 p-4 text-sm font-semibold text-green-800">
            Thanks! We received your request and will be in touch soon.
          </p>
        )}

        {result === "invalid" && (
          <p className="mt-4 rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-700">
            Please describe what you need before submitting.
          </p>
        )}

        {result === "error" && (
          <p className="mt-4 rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-700">
            Something went wrong submitting your request. Please try again or
            contact us directly.
          </p>
        )}

        <form action={submitServiceRequest} className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="message"
              className="text-sm font-semibold text-[#6b705c]"
            >
              What do you need?
            </label>
            <textarea
              id="message"
              name="message"
              rows={5}
              required
              placeholder="E.g. Sod install in the backyard, tree trim, irrigation repair..."
              className="mt-1 block w-full rounded-xl border border-[#d8d3c6] bg-white px-4 py-3 text-[#174734] outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
            />
          </div>

          <div>
            <label
              htmlFor="phone"
              className="text-sm font-semibold text-[#6b705c]"
            >
              Best phone number to reach you (optional)
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              placeholder="(555) 555-5555"
              className="mt-1 block w-full rounded-xl border border-[#d8d3c6] bg-white px-4 py-3 text-[#174734] outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-xl bg-[#174734] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#226246]"
          >
            Submit Request
          </button>
        </form>
      </section>
    </PortalShell>
  );
}
