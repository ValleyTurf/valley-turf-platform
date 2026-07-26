export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/currentUser";
import { getRolePermissions, SECTIONS } from "@/lib/permissions";
import { PermissionsForm } from "./PermissionsForm";

export default async function PermissionsPage() {
  const user = await getCurrentUser();

  if (!user || user.role !== "admin") {
    redirect("/dashboard");
  }

  const permissions = await getRolePermissions();

  return (
    <main className="min-h-screen bg-[#f5f4ef] px-4 py-6 text-[#174734] sm:px-6 sm:py-8">
      <div className="mx-auto max-w-3xl">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
              Valley Turf Revival OS
            </p>

            <h1 className="mt-2 text-3xl font-bold sm:text-4xl">
              Permissions
            </h1>

            <p className="mt-2 max-w-2xl text-[#6b705c]">
              Control which feature groups Manager and Staff logins can
              see. Admin always has full access. Team (user management)
              and Data Backup stay admin-only no matter what&apos;s set
              here.
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
          <PermissionsForm sections={SECTIONS} permissions={permissions} />

          <p className="mt-5 border-t border-[#f0ead9] pt-4 text-xs text-[#6b705c]">
            Team and Data Backup are always admin-only and aren&apos;t
            listed here — that&apos;s enforced in code, not configurable.
            Changes here take effect for everyone within about 15 seconds.
          </p>
        </section>
      </div>
    </main>
  );
}
