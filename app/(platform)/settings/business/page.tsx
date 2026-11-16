export const dynamic = "force-dynamic";
export const revalidate = 0;

// Business Details: the name, phone, website and quote sign-off that used
// to be typed into the code (ROADMAP Top 10, second list, #10). Customer
// texts, emails and invoice PDFs read these. Admin only.
import Link from "next/link";
import { getBusiness } from "@/lib/business";
import { saveBusinessDetails } from "./actions";

type PageProps = { searchParams: Promise<{ saved?: string; error?: string }> };

const inputClasses =
  "mt-1 w-full rounded-xl border border-[#d8d3c6] bg-white px-4 py-3 text-[#174734] outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20";

export default async function BusinessSettingsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const business = await getBusiness();

  return (
    <main className="min-h-screen bg-[#f5f4ef] px-4 py-6 text-[#174734] sm:px-6 sm:py-8">
      <div className="mx-auto max-w-2xl">
        <Link href="/settings" className="text-sm font-semibold text-[#9c7a20] hover:underline">
          ← Settings
        </Link>

        <h1 className="mt-2 text-3xl font-bold">Business Details</h1>
        <p className="mt-2 text-[#6b705c]">
          Shown to customers in texts, emails and on invoices. Changes apply to
          the next message sent.
        </p>

        {params.saved && (
          <p className="mt-4 rounded-2xl bg-[#e7f3e9] p-4 text-sm font-semibold text-green-800">
            Saved.
          </p>
        )}
        {params.error && (
          <p className="mt-4 rounded-2xl bg-red-50 p-4 text-sm font-semibold text-red-700">
            {params.error}
          </p>
        )}

        <form action={saveBusinessDetails} className="mt-6 space-y-5 rounded-3xl bg-white p-5 shadow sm:p-8">
          <label className="block text-sm font-bold">
            Business name
            <input name="name" defaultValue={business.name} required maxLength={80} className={inputClasses} />
          </label>

          <label className="block text-sm font-bold">
            Phone number
            <input name="phone" defaultValue={business.phoneDisplay} required className={inputClasses} />
            <span className="mt-1 block text-xs font-normal text-[#6b705c]">
              Appears as {business.phoneDashed} in texts and {business.phoneDisplay} on invoices.
            </span>
          </label>

          <label className="block text-sm font-bold">
            Website
            <input name="website" defaultValue={business.website} required className={inputClasses} />
          </label>

          <label className="block text-sm font-bold">
            First name that signs quotes
            <input
              name="ownerFirstName"
              defaultValue={business.ownerFirstName}
              required
              maxLength={40}
              className={inputClasses}
            />
          </label>

          <button
            type="submit"
            className="rounded-xl bg-[#174734] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#226246]"
          >
            Save
          </button>
        </form>

        <p className="mt-4 text-xs text-[#6b705c]">
          The public website pages, privacy policy and terms still carry their
          own copy of these details, and the Phoenix time zone is built into
          scheduling, so those are not changed here.
        </p>
      </div>
    </main>
  );
}
