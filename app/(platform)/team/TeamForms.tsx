"use client";

import { useActionState } from "react";
import {
  addUser,
  updateUser,
  resetUserPassword,
  deleteUser,
  initialActionState,
} from "./actions";

function ErrorText({ message }: { message: string | null }) {
  if (!message) return null;

  return <p className="text-sm font-semibold text-red-600">{message}</p>;
}

export function AddUserForm() {
  const [state, formAction, isPending] = useActionState(
    addUser,
    initialActionState
  );

  return (
    <form action={formAction} className="mt-4 space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-xs font-bold text-[#9c7a20]">Name</label>
          <input
            name="name"
            type="text"
            required
            placeholder="e.g. Jordan"
            className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
          />
        </div>

        <div>
          <label className="text-xs font-bold text-[#9c7a20]">Email</label>
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
            Share this with them directly — they can change it from Account
            once logged in.
          </p>
        </div>

        <div>
          <label className="text-xs font-bold text-[#9c7a20]">Role</label>
          <select
            name="role"
            defaultValue="staff"
            className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
          >
            <option value="staff">Staff</option>
            <option value="admin">Admin</option>
          </select>
        </div>

        <div>
          <label className="text-xs font-bold text-[#9c7a20]">
            Pay Rate ($/hr, optional)
          </label>
          <input
            name="hourly_rate"
            type="number"
            step="0.01"
            min="0"
            placeholder="e.g. 22.00"
            className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
          />
        </div>
      </div>

      <ErrorText message={state.error} />

      <button
        type="submit"
        disabled={isPending}
        className="rounded-lg bg-[#174734] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#226246] disabled:opacity-60"
      >
        {isPending ? "Adding…" : "Add Team Member"}
      </button>
    </form>
  );
}

type UserForForm = {
  id: string;
  name: string;
  role: "admin" | "staff";
  active: boolean;
  hourly_rate: number | string | null;
};

export function UpdateUserForm({
  user,
  isSelf,
}: {
  user: UserForForm;
  isSelf: boolean;
}) {
  const boundUpdateUser = updateUser.bind(null, user.id);
  const [state, formAction, isPending] = useActionState(
    boundUpdateUser,
    initialActionState
  );

  return (
    <form action={formAction} className="space-y-3">
      <p className="text-xs font-bold uppercase tracking-wide text-[#9c7a20]">
        Profile
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-xs font-bold text-[#9c7a20]">Name</label>
          <input
            name="name"
            type="text"
            defaultValue={user.name}
            required
            className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
          />
        </div>

        <div>
          <label className="text-xs font-bold text-[#9c7a20]">Role</label>
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

        <div>
          <label className="text-xs font-bold text-[#9c7a20]">
            Pay Rate ($/hr)
          </label>
          <input
            name="hourly_rate"
            type="number"
            step="0.01"
            min="0"
            defaultValue={
              user.hourly_rate === null ? "" : Number(user.hourly_rate)
            }
            placeholder="Not set"
            className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
          />
        </div>
      </div>

      <p className="text-xs text-[#6b705c]">
        More profile fields (phone, hire date, etc.) can go here as they
        come up.
      </p>

      <label className="flex items-center gap-2 text-sm font-semibold">
        <input
          name="active"
          type="checkbox"
          defaultChecked={user.active}
          disabled={isSelf}
        />
        Active (can log in)
      </label>

      <ErrorText message={state.error} />

      <button
        type="submit"
        disabled={isPending}
        className="rounded-lg bg-[#174734] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#226246] disabled:opacity-60"
      >
        {isPending ? "Saving…" : "Save Changes"}
      </button>
    </form>
  );
}

export function ResetPasswordForm({ userId }: { userId: string }) {
  const boundReset = resetUserPassword.bind(null, userId);
  const [state, formAction, isPending] = useActionState(
    boundReset,
    initialActionState
  );

  return (
    <form
      action={formAction}
      className="space-y-3 border-t border-[#e7e2d5] pt-4"
    >
      <div className="flex flex-wrap items-end gap-3">
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
          disabled={isPending}
          className="rounded-lg border border-[#174734] px-4 py-2 text-sm font-bold text-[#174734] transition hover:bg-[#174734] hover:text-white disabled:opacity-60"
        >
          {isPending ? "Resetting…" : "Reset Password"}
        </button>
      </div>

      <ErrorText message={state.error} />
    </form>
  );
}

export function DeleteUserForm({
  userId,
  userName,
}: {
  userId: string;
  userName: string;
}) {
  const boundDelete = deleteUser.bind(null, userId);
  const [state, formAction, isPending] = useActionState(
    boundDelete,
    initialActionState
  );

  return (
    <form action={formAction} className="space-y-2 pt-1">
      <button
        type="submit"
        disabled={isPending}
        onClick={(event) => {
          if (
            !window.confirm(
              `Remove ${userName} from Team? They'll immediately lose access.`
            )
          ) {
            event.preventDefault();
          }
        }}
        className="rounded-lg border border-red-300 px-4 py-2 text-sm font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-60"
      >
        {isPending ? "Removing…" : "Remove Team Member"}
      </button>

      <ErrorText message={state.error} />
    </form>
  );
}
