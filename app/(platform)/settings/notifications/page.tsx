export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/currentUser";
import { supabaseServer } from "@/lib/supabase-server";
import { updateReminderRule, updateReviewRequestSettings } from "./actions";

type ReminderRule = {
  id: string;
  days_before: number;
  enabled: boolean;
};

type ReviewRequestSettings = {
  enabled: boolean;
  days_after_visit: number;
  google_review_url: string | null;
};

export default async function NotificationsSettingsPage() {
  const user = await getCurrentUser();

  if (!user || user.role !== "admin") {
    redirect("/my-day");
  }

  const [rulesResult, reviewSettingsResult] = await Promise.all([
    supabaseServer
      .from("visit_reminder_rules")
      .select("id, days_before, enabled")
      .order("days_before", { ascending: false }),

    supabaseServer
      .from("review_request_settings")
      .select("enabled, days_after_visit, google_review_url")
      .eq("id", 1)
      .maybeSingle(),
  ]);

  const rules = (rulesResult.data ?? []) as ReminderRule[];
  const reviewSettings = reviewSettingsResult.data as ReviewRequestSettings | null;

  return (
    <main className="min-h-screen bg-[#f5f4ef] px-4 py-6 text-[#174734] sm:px-6 sm:py-8">
      <div className="mx-auto max-w-3xl">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
              Valley Turf Revival OS
            </p>

            <h1 className="mt-2 text-3xl font-bold sm:text-4xl">
              Notifications
            </h1>

            <p className="mt-2 max-w-2xl text-[#6b705c]">
              Automated text/email messages sent to customers. Reminders
              go out to any customer with a phone or email on file — no
              opt-in step, since these are transactional messages about a
              scheduled visit.
            </p>
          </div>

          <Link
            href="/settings"
            className="rounded-xl border border-[#174734] px-4 py-2 text-center text-sm font-bold transition hover:bg-white"
          >
            Back to Settings
          </Link>
        </header>

        <section className="mt-6 rounded-2xl bg-white p-5 shadow">
          <h2 className="text-lg font-bold">Pre-Visit Reminders</h2>
          <p className="mt-1 text-sm text-[#6b705c]">
            Sent automatically once a day for every rule below that&apos;s
            turned on. Each rule fires once per visit — a customer with
            both rules enabled gets two separate reminders.
          </p>

          <div className="mt-4 space-y-3">
            {rules.length === 0 ? (
              <p className="rounded-xl bg-[#f7f6f1] p-4 text-sm text-[#6b705c]">
                No reminder rules found — run the migration to seed the
                defaults.
              </p>
            ) : (
              rules.map((rule) => (
                <form
                  key={rule.id}
                  action={updateReminderRule.bind(null, rule.id)}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-[#e7e2d5] p-4"
                >
                  <label className="flex items-center gap-2 text-sm font-bold">
                    <input
                      type="checkbox"
                      name="enabled"
                      defaultChecked={rule.enabled}
                      className="h-4 w-4 rounded border-[#d9d4c6] text-[#174734] focus:ring-[#d4af37]"
                    />
                    On
                  </label>

                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="number"
                      name="days_before"
                      min={1}
                      defaultValue={rule.days_before}
                      className="w-20 rounded-lg border border-[#d9d4c6] px-2 py-1.5 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
                    />
                    days before the visit
                  </label>

                  <button
                    type="submit"
                    className="ml-auto rounded-xl bg-[#174734] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#226246]"
                  >
                    Save
                  </button>
                </form>
              ))
            )}
          </div>
        </section>

        <section className="mt-6 rounded-2xl bg-white p-5 shadow">
          <h2 className="text-lg font-bold">Review Requests</h2>
          <p className="mt-1 text-sm text-[#6b705c]">
            Sends a request for a Google review a set number of days after
            a visit is marked completed. Off by default — add your Google
            review link and check &ldquo;On&rdquo; when you&apos;re ready
            to start sending these.
          </p>

          <form
            action={updateReviewRequestSettings}
            className="mt-4 space-y-4 rounded-xl border border-[#e7e2d5] p-4"
          >
            <label className="flex items-center gap-2 text-sm font-bold">
              <input
                type="checkbox"
                name="enabled"
                defaultChecked={reviewSettings?.enabled ?? false}
                className="h-4 w-4 rounded border-[#d9d4c6] text-[#174734] focus:ring-[#d4af37]"
              />
              On
            </label>

            <div>
              <label
                htmlFor="days_after_visit"
                className="text-xs font-bold text-[#9c7a20]"
              >
                Days after visit completion
              </label>
              <input
                id="days_after_visit"
                type="number"
                name="days_after_visit"
                min={0}
                defaultValue={reviewSettings?.days_after_visit ?? 1}
                className="mt-1 w-24 rounded-lg border border-[#d9d4c6] px-2 py-1.5 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
              />
            </div>

            <div>
              <label
                htmlFor="google_review_url"
                className="text-xs font-bold text-[#9c7a20]"
              >
                Google review link
              </label>
              <input
                id="google_review_url"
                type="url"
                name="google_review_url"
                placeholder="https://g.page/r/.../review"
                defaultValue={reviewSettings?.google_review_url ?? ""}
                className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
              />
              <p className="mt-1 text-xs text-[#6b705c]">
                From your Google Business Profile &ldquo;Ask for
                reviews&rdquo; link.
              </p>
            </div>

            <button
              type="submit"
              className="rounded-xl bg-[#174734] px-6 py-2.5 text-sm font-bold text-white transition hover:bg-[#226246]"
            >
              Save
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
