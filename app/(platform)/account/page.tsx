export const dynamic = "force-dynamic";
export const revalidate = 0;

import { getCurrentUser } from "@/lib/currentUser";
import ChangePasswordForm from "./ChangePasswordForm";
import NotificationsSection from "./NotificationsSection";
import { supabaseServer } from "@/lib/supabase-server";
import { pushKindsForRole } from "@/lib/pushKinds";
import { savePushPreferences, saveMyPhone } from "./actions";

export default async function AccountPage() {
  const user = await getCurrentUser();

  // Which notification kinds this person has turned off (migration
  // 108). No row, or a failed lookup, means nothing is turned off.
  const { data: preferenceRow } = user
    ? await supabaseServer
        .from("user_push_preferences")
        .select("disabled_kinds")
        .eq("user_id", user.id)
        .maybeSingle()
    : { data: null };

  // Own cell number for CRM calling (migration 121). A missing column or a
  // failed lookup just shows an empty field.
  const { data: phoneRow } = user
    ? await supabaseServer.from("users").select("phone").eq("id", user.id).maybeSingle()
    : { data: null };
  const myPhone = (phoneRow?.phone as string | null | undefined) ?? "";

  const disabledKinds = new Set<string>(
    (preferenceRow?.disabled_kinds as string[] | null) ?? []
  );
  const availableKinds = user ? pushKindsForRole(user.role) : [];

  return (
    <main className="min-h-screen bg-[#f5f4ef] px-4 py-6 text-[#174734] sm:px-6 sm:py-8">
      <div className="mx-auto max-w-lg">
        <header>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
            Valley Turf Revival OS
          </p>

          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Account</h1>
        </header>

        <section className="mt-6 rounded-2xl bg-white p-5 shadow">
          <h2 className="text-lg font-bold">Signed In As</h2>

          <div className="mt-3 space-y-1 text-sm">
            <p>
              <span className="font-bold">Name:</span> {user?.name}
            </p>
            <p>
              <span className="font-bold">Email:</span> {user?.email}
            </p>
            <p>
              <span className="font-bold">Role:</span> {user?.role}
            </p>
          </div>
        </section>

        <section className="mt-6 rounded-2xl bg-white p-5 shadow">
          <h2 className="text-lg font-bold">My Cell Number</h2>

          <p className="mt-1 text-sm text-[#174734]/70">
            When you tap Call on a customer, the business number rings this
            phone first, then connects you to the customer, who sees the
            business number instead of yours. For owners, calls to the
            business number also ring this phone.
          </p>

          <form action={saveMyPhone} className="mt-3 flex gap-2">
            <input
              name="phone"
              type="tel"
              defaultValue={myPhone}
              placeholder="(480) 555-0123"
              className="min-w-0 flex-1 rounded-xl border border-[#d9dad2] px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="rounded-xl bg-[#174734] px-4 py-2 text-sm font-bold text-white"
            >
              Save
            </button>
          </form>
        </section>

        <section className="mt-6 rounded-2xl bg-white p-5 shadow">
          <h2 className="text-lg font-bold">Change Password</h2>

          <ChangePasswordForm />
        </section>

        <NotificationsSection />

        {availableKinds.length > 0 && (
          <section className="mt-6 rounded-2xl bg-white p-5 shadow">
            <h2 className="text-lg font-bold">What to Notify Me About</h2>

            <p className="mt-1 text-sm text-[#174734]/70">
              Applies to every device you&apos;ve enabled notifications on.
              Reactions like &quot;Liked&quot; never send one.
            </p>

            <form action={savePushPreferences} className="mt-3 space-y-3">
              {availableKinds.map((entry) => (
                <label key={entry.kind} className="flex items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    name={`push_${entry.kind}`}
                    defaultChecked={!disabledKinds.has(entry.kind)}
                    className="mt-1"
                  />
                  <span>
                    <span className="font-bold">{entry.label}</span>
                    <span className="block text-[#174734]/70">{entry.description}</span>
                  </span>
                </label>
              ))}

              <button
                type="submit"
                className="rounded-xl bg-[#174734] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#123a29]"
              >
                Save
              </button>
            </form>
          </section>
        )}
      </div>
    </main>
  );
}
