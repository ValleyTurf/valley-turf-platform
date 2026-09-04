"use client";

// Reusable "Compose Email" affordance -- dropped into the Customer page,
// the Reactivation Pipeline, and Customer Intelligence, all pointed at
// the same shared action (lib/composeEmailAction.ts). Starts collapsed
// as a single button so it doesn't add clutter to pages that already
// show a lot per customer row; opening it reveals a plain subject/body
// form. Calls the server action directly via useTransition (same
// pattern as ExclusionSaveForm.tsx) rather than a bare <form
// action={...}> so a send failure -- no email on file, Resend not
// configured, etc. -- has somewhere inline to show up instead of just
// silently not working.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendManualEmailToCustomer } from "@/lib/composeEmailAction";

export function ComposeEmailForm({
  jobberClientId,
  buttonClassName,
}: {
  jobberClientId: string;
  buttonClassName?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    setSent(false);

    startTransition(async () => {
      const result = await sendManualEmailToCustomer(jobberClientId, formData);

      if (result.error) {
        setError(result.error);
        return;
      }

      setSubject("");
      setBody("");
      setSent(true);
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
        Compose Email
      </button>
    );
  }

  return (
    <form
      action={handleSubmit}
      className="mt-2 w-full space-y-2 rounded-xl border border-[#e7e2d5] bg-white p-3"
    >
      <input
        type="text"
        name="subject"
        placeholder="Subject"
        value={subject}
        onChange={(event) => setSubject(event.target.value)}
        disabled={isPending}
        className="w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20 disabled:opacity-60"
      />

      <textarea
        name="body"
        rows={4}
        placeholder="Write your message…"
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
          {isPending ? "Sending…" : sent ? "Sent ✓" : "Send Email"}
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
