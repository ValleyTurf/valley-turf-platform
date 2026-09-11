"use client";

// SMS counterpart to ComposeEmailForm.tsx -- same collapsed-button ->
// inline-form pattern, same useTransition-driven submit (so a send
// failure, e.g. no phone on file or Twilio not configured, has somewhere
// inline to show up), just a single body field and no subject. Calls
// lib/composeSmsAction.ts's sendManualSmsToCustomer, the same action the
// Messages per-customer reply box already uses.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendManualSmsToCustomer } from "@/lib/composeSmsAction";

export function ComposeSmsForm({
  jobberClientId,
  buttonClassName,
  onSent,
}: {
  jobberClientId: string;
  buttonClassName?: string;
  // Optional hook fired after a successful send, before the router
  // refresh -- e.g. the Reactivation Pipeline binds this to mark a
  // customer "Texted" automatically, the same status update its
  // StatusButton triggers, so sending here doesn't also require a
  // separate manual click.
  onSent?: () => void | Promise<void>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    setSent(false);

    startTransition(async () => {
      const result = await sendManualSmsToCustomer(jobberClientId, formData);

      if (result.error) {
        setError(result.error);
        return;
      }

      setBody("");
      setSent(true);
      await onSent?.();
      router.refresh();
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
        Compose Text
      </button>
    );
  }

  return (
    <form
      action={handleSubmit}
      className="mt-2 w-full space-y-2 rounded-xl border border-[#e7e2d5] bg-white p-3"
    >
      <textarea
        name="body"
        rows={4}
        placeholder="Write your text…"
        value={body}
        onChange={(event) => setBody(event.target.value)}
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
          {isPending ? "Sending…" : sent ? "Sent ✓" : "Send Text"}
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
