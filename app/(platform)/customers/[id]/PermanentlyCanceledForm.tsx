"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  setCustomerPermanentlyCanceled,
  restoreCustomer,
} from "./actions";

// Ryan (2026-10-11): "I want to find a way to mark as permanently
// canceled so they don't show on customer map, or any list of
// customers I pull." Same client-component-calls-the-action-directly
// pattern as app/(platform)/customers/intelligence/ExclusionSaveForm.tsx
// (explicit pending/saved state + router.refresh(), rather than relying
// on a bare <form action={...}>'s implicit post-submit refresh) --
// except this one also has to flip between two very different
// renders (not canceled vs. already canceled), so it owns a bit more
// state than that component needs to.
export function PermanentlyCanceledForm({
  jobberClientId,
  isCanceled,
  canceledAt,
  canceledReason,
  reasons,
}: {
  jobberClientId: string;
  isCanceled: boolean;
  canceledAt: string | null;
  canceledReason: string | null;
  reasons: { value: string; label: string }[];
}) {
  const router = useRouter();
  const [reason, setReason] = useState(reasons[0]?.value ?? "");
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (isCanceled) {
    const reasonLabel =
      reasons.find((option) => option.value === canceledReason)?.label ??
      canceledReason ??
      "Permanently Canceled";

    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
        <p className="text-xs font-semibold text-red-700">
          Permanently Canceled — {reasonLabel}
          {canceledAt && (
            <span className="font-normal text-red-600">
              {" "}
              ({new Date(canceledAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })})
            </span>
          )}
        </p>

        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            startTransition(async () => {
              await restoreCustomer(jobberClientId);
              router.refresh();
            });
          }}
          className="rounded-lg border border-red-300 px-3 py-1 text-xs font-bold text-red-700 transition hover:bg-red-100 disabled:opacity-60"
        >
          {isPending ? "Restoring…" : "Restore Customer"}
        </button>
      </div>
    );
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-lg border border-[#d8d3c6] px-3 py-2 text-xs font-bold text-[#6b705c] transition hover:border-red-300 hover:text-red-700"
      >
        Mark Permanently Canceled
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
      <select
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        disabled={isPending}
        className="rounded-lg border border-[#d8d3c6] bg-white px-3 py-2 text-xs font-semibold text-[#174734] disabled:opacity-60"
      >
        {reasons.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          startTransition(async () => {
            await setCustomerPermanentlyCanceled(jobberClientId, reason);
            router.refresh();
          });
        }}
        className="rounded-lg border border-red-600 bg-red-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-red-700 disabled:opacity-60"
      >
        {isPending ? "Saving…" : "Confirm — Removes From All Lists"}
      </button>

      <button
        type="button"
        disabled={isPending}
        onClick={() => setConfirming(false)}
        className="rounded-lg px-3 py-2 text-xs font-semibold text-[#6b705c] hover:underline"
      >
        Cancel
      </button>
    </div>
  );
}
