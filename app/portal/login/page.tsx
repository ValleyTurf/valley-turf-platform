export const dynamic = "force-dynamic";
export const revalidate = 0;

import { PortalShell } from "../PortalShell";
import PortalLoginForm from "./PortalLoginForm";

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
          Enter the email address or phone number on file with us and
          we&apos;ll send you a link to sign in — no password needed.
        </p>

        {result === "sent" && (
          <p className="mt-4 rounded-xl bg-green-50 p-4 text-sm font-semibold text-green-800">
            If that matches an account on file, a sign-in link is on its
            way. It&apos;s valid for 15 minutes and can only be used once.
          </p>
        )}

        {result === "invalid" && (
          <p className="mt-4 rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-700">
            Enter an email address or phone number to continue.
          </p>
        )}

        {result === "expired" && (
          <p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm font-semibold text-amber-800">
            That sign-in link has expired or was already used. Request a new
            one below.
          </p>
        )}

        <PortalLoginForm />
      </section>
    </PortalShell>
  );
}
