"use client";

import { useActionState } from "react";
import { changeOwnPassword, initialChangePasswordState } from "./actions";

export default function ChangePasswordForm() {
  const [state, formAction, isPending] = useActionState(
    changeOwnPassword,
    initialChangePasswordState
  );

  return (
    <form action={formAction} className="mt-4 space-y-3">
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

      {state.error && (
        <p className="text-sm font-semibold text-red-600">{state.error}</p>
      )}

      {state.success && (
        <p className="text-sm font-semibold text-[#2E6B3F]">
          Password updated.
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="rounded-lg bg-[#174734] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#226246] disabled:opacity-60"
      >
        {isPending ? "Updating…" : "Update Password"}
      </button>
    </form>
  );
}
