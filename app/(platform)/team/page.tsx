export const dynamic = "force-dynamic";
export const revalidate = 0;

import { supabaseServer } from "@/lib/supabase-server";
import { getCurrentUser } from "@/lib/currentUser";
import {
  AddUserForm,
  UpdateUserForm,
  ResetPasswordForm,
  DeleteUserForm,
} from "./TeamForms";

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "staff";
  active: boolean;
  hourly_rate: number | string | null;
  last_login_at: string | null;
  created_at: string;
};

function formatDate(value: string | null): string {
  if (!value) return "Never";

  return new Date(value).toLocaleString("en-US", {
    timeZone: "America/Phoenix",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatRate(value: number | string | null): string {
  if (value === null || value === undefined || value === "") {
    return "Not set";
  }

  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? `${new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
      }).format(parsed)}/hr`
    : "Not set";
}

export default async function TeamPage() {
  const [{ data, error }, currentUser] = await Promise.all([
    supabaseServer
      .from("users")
      .select(
        "id, name, email, role, active, hourly_rate, last_login_at, created_at"
      )
      .order("created_at", { ascending: true }),
    getCurrentUser(),
  ]);

  const users = (data ?? []) as UserRow[];

  return (
    <main className="min-h-screen bg-[#f5f4ef] px-6 py-8 text-[#174734]">
      <div className="mx-auto max-w-3xl">
        <header>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
            Valley Turf Revival OS
          </p>

          <h1 className="mt-2 text-4xl font-bold">Team</h1>

          <p className="mt-2 max-w-2xl text-[#6b705c]">
            Individual logins and access levels. Admins see everything;
            staff accounts are locked out of financials, cost data, and
            settings.
          </p>
        </header>

        {error && (
          <section className="mt-6 rounded-2xl border border-red-200 bg-white p-5 shadow">
            <p className="font-bold text-red-700">Team could not be loaded</p>
            <p className="mt-1 text-sm text-red-600">{error.message}</p>
          </section>
        )}

        <section className="mt-6 rounded-2xl bg-white p-5 shadow">
          <h2 className="text-lg font-bold">Add a Team Member</h2>

          <AddUserForm />
        </section>

        <section className="mt-6 rounded-2xl bg-white p-5 shadow">
          <h2 className="text-lg font-bold">Current Team</h2>

          <div className="mt-4 space-y-3">
            {users.length === 0 ? (
              <p className="rounded-xl bg-[#f7f6f1] px-3 py-2 text-sm text-[#6b705c]">
                No team members yet.
              </p>
            ) : (
              users.map((user) => (
                <UserRowItem
                  key={user.id}
                  user={user}
                  isSelf={user.id === currentUser?.id}
                />
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function UserRowItem({
  user,
  isSelf,
}: {
  user: UserRow;
  isSelf: boolean;
}) {
  return (
    <details className="rounded-xl border border-[#e7e2d5] px-3 py-2">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold">
            {user.name}
            {isSelf && (
              <span className="ml-2 text-xs font-normal text-[#6b705c]">
                (you)
              </span>
            )}
          </p>
          <p className="text-xs text-[#6b705c]">{user.email}</p>
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden text-xs font-semibold text-[#6b705c] sm:inline">
            {formatRate(user.hourly_rate)}
          </span>
          {!user.active && (
            <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-bold text-red-700">
              Inactive
            </span>
          )}
          <span className="rounded-full bg-[#f0ead9] px-2 py-1 text-xs font-bold uppercase text-[#9c7a20]">
            {user.role}
          </span>
        </div>
      </summary>

      <div className="mt-4 space-y-4 border-t border-[#e7e2d5] pt-4">
        <p className="text-xs text-[#6b705c]">
          Last login: {formatDate(user.last_login_at)}
        </p>

        <UpdateUserForm user={user} isSelf={isSelf} />

        <ResetPasswordForm userId={user.id} />

        {!isSelf && (
          <DeleteUserForm userId={user.id} userName={user.name} />
        )}
      </div>
    </details>
  );
}
