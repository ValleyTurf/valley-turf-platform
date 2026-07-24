export const dynamic = "force-dynamic";
export const revalidate = 0;

import { supabaseServer } from "@/lib/supabase-server";
import { getCurrentUser } from "@/lib/currentUser";
import {
  addUser,
  updateUser,
  resetUserPassword,
  deleteUser,
} from "./actions";

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "staff";
  active: boolean;
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

export default async function TeamPage() {
  const [{ data, error }, currentUser] = await Promise.all([
    supabaseServer
      .from("users")
      .select("id, name, email, role, active, last_login_at, created_at")
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

          <form action={addUser} className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-bold text-[#9c7a20]">
                  Name
                </label>
                <input
                  name="name"
                  type="text"
                  required
                  placeholder="e.g. Jordan"
                  className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[#9c7a20]">
                  Email
                </label>
                <input
                  name="email"
                  type="email"
                  required
                  placeholder="jordan@example.com"
                  className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[#9c7a20]">
                  Starting Password
                </label>
                <input
                  name="password"
                  type="text"
                  required
                  minLength={8}
                  placeholder="At least 8 characters"
                  className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
                />
                <p className="mt-1 text-xs text-[#6b705c]">
                  Share this with them directly — they can change it from
                  Account once logged in.
                </p>
              </div>

              <div>
                <label className="text-xs font-bold text-[#9c7a20]">
                  Role
                </label>
                <select
                  name="role"
                  defaultValue="staff"
                  className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
                >
                  <option value="staff">Staff</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              className="rounded-lg bg-[#174734] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#226246]"
            >
              Add Team Member
            </button>
          </form>
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

        <form action={updateUser.bind(null, user.id)} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-bold text-[#9c7a20]">
                Name
              </label>
              <input
                name="name"
                type="text"
                defaultValue={user.name}
                required
                className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-[#9c7a20]">
                Role
              </label>
              <select
                name="role"
                defaultValue={user.role}
                disabled={isSelf}
                className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20 disabled:opacity-60"
              >
                <option value="staff">Staff</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm font-semibold">
            <input
              name="active"
              type="checkbox"
              defaultChecked={user.active}
              disabled={isSelf}
            />
            Active (can log in)
          </label>

          <button
            type="submit"
            className="rounded-lg bg-[#174734] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#226246]"
          >
            Save Changes
          </button>
        </form>

        <form
          action={resetUserPassword.bind(null, user.id)}
          className="flex flex-wrap items-end gap-3 border-t border-[#e7e2d5] pt-4"
        >
          <div className="flex-1">
            <label className="text-xs font-bold text-[#9c7a20]">
              Reset Password
            </label>
            <input
              name="password"
              type="text"
              required
              minLength={8}
              placeholder="New password (8+ characters)"
              className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
            />
          </div>

          <button
            type="submit"
            className="rounded-lg border border-[#174734] px-4 py-2 text-sm font-bold text-[#174734] transition hover:bg-[#174734] hover:text-white"
          >
            Reset Password
          </button>
        </form>

        {!isSelf && (
          <form action={deleteUser.bind(null, user.id)} className="pt-1">
            <button
              type="submit"
              className="rounded-lg border border-red-300 px-4 py-2 text-sm font-bold text-red-700 transition hover:bg-red-50"
            >
              Remove Team Member
            </button>
          </form>
        )}
      </div>
    </details>
  );
}
