export const dynamic = "force-dynamic";
export const revalidate = 0;

// Notification preferences the customer controls. Invoices, receipts and
// payment notices are always sent, so they are explained but not switchable.
import { redirect } from "next/navigation";
import { getCurrentPortalUser } from "@/lib/currentPortalUser";
import { loadNotificationPrefs, prefsFor } from "@/lib/notificationPrefs";
import { REMINDER_CHANNELS } from "@/lib/notificationPrefsLogic";
import { PortalShell } from "../PortalShell";
import { saveNotificationPrefs } from "./actions";

export default async function PortalNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ result?: string }>;
}) {
  const customer = await getCurrentPortalUser();

  if (!customer) {
    redirect("/portal/login");
  }

  const { result } = await searchParams;
  const prefs = prefsFor(await loadNotificationPrefs([customer.jobberClientId]), customer.jobberClientId);

  return (
    <PortalShell activeHref="/portal/notifications" customerName={customer.name}>
      <section className="rounded-3xl bg-white p-6 shadow">
        <h2 className="text-lg font-bold">Notifications</h2>
        <p className="mt-1 text-sm text-[#6b705c]">Choose how and when we contact you.</p>

        {result === "saved" && (
          <p className="mt-4 rounded-xl bg-green-50 p-4 text-sm font-semibold text-green-800">
            Your preferences are saved.
          </p>
        )}
        {result === "error" && (
          <p className="mt-4 rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-700">
            Something went wrong saving that. Please try again.
          </p>
        )}

        <form action={saveNotificationPrefs} className="mt-6 space-y-6">
          <fieldset>
            <legend className="text-sm font-bold">Visit reminders</legend>
            <div className="mt-2 space-y-2">
              {REMINDER_CHANNELS.map((option) => (
                <label
                  key={option.value}
                  className="flex cursor-pointer items-start gap-3 rounded-2xl border border-[#e7e2d5] p-4 text-sm"
                >
                  <input
                    type="radio"
                    name="reminder_channel"
                    value={option.value}
                    defaultChecked={prefs.reminderChannel === option.value}
                    className="mt-0.5 h-4 w-4"
                  />
                  <span>
                    <span className="font-bold">{option.label}</span>
                    <br />
                    <span className="text-[#6b705c]">{option.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-sm font-bold">Other messages</legend>
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                name="review_requests"
                defaultChecked={prefs.reviewRequestsEnabled}
                className="mt-0.5 h-4 w-4"
              />
              <span>
                Ask me for a review after a visit
              </span>
            </label>
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                name="promotions"
                defaultChecked={prefs.promotionsEnabled}
                className="mt-0.5 h-4 w-4"
              />
              <span>Send me seasonal offers and promotions</span>
            </label>
          </fieldset>

          <p className="rounded-2xl bg-[#f7f6f1] p-4 text-sm text-[#6b705c]">
            Invoices, payment receipts and autopay notices are always sent so you never miss a bill.
            If something looks wrong, send us a message and we&apos;ll help.
          </p>

          <button
            type="submit"
            className="rounded-xl bg-[#174734] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#226246]"
          >
            Save preferences
          </button>
        </form>
      </section>
    </PortalShell>
  );
}
