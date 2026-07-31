export const dynamic = "force-dynamic";
export const revalidate = 0;

import { PortalShell } from "../PortalShell";
import { requestPortalLogin } from "./actions";

export default async function PortalLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ result?: string }>;
}) {
  const { result } = await searchParams;

  return (
    <PortalShell>
      <section className="rounded-3xl bg-white p-6 shadow sm:p-8">
        <h2 className="text-xl font-bold">Sign in to your account</h2>
        <p className="mt-2 text-sm text-[#6b705c]">
          Enter the email address on file with us and we&apos;ll send you a
          link to sign in — no password needed.
        </p>

        {result === "sent" && (
          <p className="mt-4 rounded-xl bg-green-50 p-4 text-sm font-semibold text-green-800">
            If that email matches an account on file, a sign-in link is on
            its way. It&apos;s valid for 15 minutes and can only be used
            once.
          </p>
        )}

        {result === "invalid" && (
          <p className="mt-4 rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-700">
            Enter an email address to continue.
          </p>
        )}

        {result === "expired" && (
          <p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm font-semibold text-amber-800">
            That sign-in link has expired or was already used. Request a new
            one below.
          </p>
        )}

        <form action={requestPortalLogin} className="mt-6 space-y-3">
          <label
            htmlFor="email"
            className="text-sm font-semibold text-[#6b705c]"
          >
            Email address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            placeholder="you@example.com"
            className="block w-full rounded-xl border border-[#d8d3c6] bg-white px-4 py-3 text-[#174734] outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
          />
          <button
            type="submit"
            className="w-full rounded-xl bg-[#174734] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#226246]"
          >
            Send sign-in link
          </button>
        </form>
      </section>
    </PortalShell>
  );
}
