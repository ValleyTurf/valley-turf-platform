"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveExclusionReason } from "./actions";

// Calls saveExclusionReason directly (server actions are callable like
// any async function from a client component, not just as a bare
// <form action={...}>) so we can explicitly track a pending/saved
// state and force router.refresh() afterward. The plain-form version
// of this relied on Next's implicit post-action refresh, which wasn't
// reliably updating the list without a manual page reload — this
// guarantees the row disappears (or the tally updates) the moment the
// save completes, with a brief "Saved" confirmation on the button.
export function ExclusionSaveForm({
  jobberClientId,
  exclusionType,
  defaultReason,
  reasons,
}: {
  jobberClientId: string;
  exclusionType: "reactivation" | "deactivation";
  defaultReason: string;
  reasons: { value: string; label: string }[];
}) {
  const router = useRouter();
  const [reason, setReason] = useState(defaultReason);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setSaved(false);

    startTransition(async () => {
      await saveExclusionReason(formData);
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <form action={handleSubmit} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="jobber_client_id" value={jobberClientId} />
      <input type="hidden" name="exclusion_type" value={exclusionType} />

      <select
        name="reason"
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
        type="submit"
        disabled={isPending}
        className="rounded-lg border border-[#174734] px-3 py-2 text-xs font-bold transition hover:bg-[#174734] hover:text-white disabled:opacity-60"
      >
        {isPending ? "Saving…" : saved ? "Saved ✓" : "Save"}
      </button>
    </form>
  );
}
