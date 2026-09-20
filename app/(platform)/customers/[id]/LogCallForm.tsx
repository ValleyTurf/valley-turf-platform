"use client";

// "Log Phone Call" pill for the Contact History section -- same
// collapsed-button -> inline-form pattern as
// app/components/ComposeEmailForm.tsx / ComposeSmsForm.tsx (Ryan,
// 2026-09-20: wanted it sitting right next to Compose Text instead of
// the old "Log a Call" panel that stayed open above them all the time).
//
// Calls actions.ts's logPhoneCall directly via useTransition, same as
// the two compose forms, rather than the old plain
// <form action={logPhoneCall.bind(...)}> -- that plain-form version
// worked fine (logPhoneCall already revalidates the page), but gives up
// the moment this became a collapsible pill: there'd be no controlled
// state to reset the summary field or show a "Saved" state after a
// successful save, and no inline spot for the (rare) "must be signed
// in" error to show up instead of just failing silently.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { logPhoneCall } from "./actions";

type CallDirection = "outbound" | "inbound";

export function LogCallForm({
  jobberClientId,
  buttonClassName,
}: {
  jobberClientId: string;
  buttonClassName?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<CallDirection>("outbound");
  const [summary, setSummary] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    setSaved(false);

    // logPhoneCall itself silently no-ops on an empty summary (same
    // tolerance a plain <form action> submit had, since there was
    // nowhere inline for an error to show) -- matched here so an empty
    // submit doesn't flash a false "Saved ✓".
    if (!summary.trim()) {
      return;
    }

    startTransition(async () => {
      try {
        await logPhoneCall(jobberClientId, formData);
        setSummary("");
        setSaved(true);
        router.refresh();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Couldn't save that call."
        );
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          buttonClassName ??
          "whitespace-nowrap rounded-lg border border-[#174734] px-3 py-1.5 text-xs font-bold text-[#174734] transition hover:bg-[#174734] hover:text-white"
        }
      >
        Log Phone Call
      </button>
    );
  }

  return (
    <form
      action={handleSubmit}
      className="mt-2 w-full space-y-2 rounded-xl border border-[#e7e2d5] bg-white p-3"
    >
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-xs">
          <input
            type="radio"
            name="direction"
            value="outbound"
            checked={direction === "outbound"}
            onChange={() => setDirection("outbound")}
            disabled={isPending}
            className="h-3.5 w-3.5"
          />
          We called them
        </label>
        <label className="flex items-center gap-1.5 text-xs">
          <input
            type="radio"
            name="direction"
            value="inbound"
            checked={direction === "inbound"}
            onChange={() => setDirection("inbound")}
            disabled={isPending}
            className="h-3.5 w-3.5"
          />
          They called us
        </label>
      </div>

      <textarea
        name="summary"
        rows={4}
        placeholder="Quick summary of what was discussed"
        value={summary}
        onChange={(event) => setSummary(event.target.value)}
        disabled={isPending}
        className="w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20 disabled:opacity-60"
      />

      {error && (
        <p className="text-xs font-semibold text-[#991b1b]">{error}</p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-[#174734] px-3 py-1.5 text-xs font-bold text-white transition hover:bg-[#226246] disabled:opacity-60"
        >
          {isPending ? "Saving…" : saved ? "Saved ✓" : "Save Call"}
        </button>

        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          disabled={isPending}
          className="text-xs font-semibold text-[#6b705c] hover:underline disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
