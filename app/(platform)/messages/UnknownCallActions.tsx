"use client";

// Add as lead / Dismiss for an unknown caller's row in the Phone column
// (same actions the Unknown senders list uses for texts and emails).
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addUnknownContactAsLead, dismissUnknownContact } from "@/lib/unknownContactActions";

export default function UnknownCallActions({ contactId }: { contactId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: (id: string) => Promise<{ error: string | null }>) {
    setError(null);
    startTransition(async () => {
      const result = await action(contactId);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        disabled={isPending}
        onClick={() => run(addUnknownContactAsLead)}
        className="rounded-full bg-[#174734] px-2.5 py-1 text-xs font-bold text-white disabled:opacity-50"
      >
        Add lead
      </button>
      <button
        type="button"
        disabled={isPending}
        onClick={() => run(dismissUnknownContact)}
        className="rounded-full border border-[#e7e2d5] px-2.5 py-1 text-xs font-bold text-[#6b705c] disabled:opacity-50"
      >
        Dismiss
      </button>
      {error ? <span className="text-xs text-[#9a2f22]">{error}</span> : null}
    </span>
  );
}
