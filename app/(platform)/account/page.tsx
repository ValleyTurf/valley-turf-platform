export const dynamic = "force-dynamic";
export const revalidate = 0;

import { getCurrentUser } from "@/lib/currentUser";
import { changeOwnPassword } from "./actions";

export default async function AccountPage() {
  const user = await getCurrentUser();

  return (
    <main className="min-h-screen bg-[#f5f4ef] px-6 py-8 text-[#174734]">
      <div className="mx-auto max-w-lg">
        <header>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
            Valley Turf Revival OS
          </p>

          <h1 className="mt-2 text-4xl font-bold">Account</h1>
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
          <h2 className="text-lg font-bold">Change Password</h2>

          <form action={changeOwnPassword} className="mt-4 space-y-3">
            <div>
              <label className="text-xs font-bold text-[#9c7a20]">
                Current Password
              </label>
              <input
                name="current_password"
                type="password"
                required
                autoComplete="current-password"
                className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-[#9c7a20]">
                New Password
              </label>
              <input
                name="new_password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
              />
            </div>

            <button
              type="submit"
              className="rounded-lg bg-[#174734] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#226246]"
            >
              Update Password
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
