export const dynamic = "force-dynamic";
export const revalidate = 0;

import { getCurrentUser } from "@/lib/currentUser";
import ChangePasswordForm from "./ChangePasswordForm";

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

          <ChangePasswordForm />
        </section>
      </div>
    </main>
  );
}
