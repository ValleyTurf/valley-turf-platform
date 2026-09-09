"use client";

// Single-field reply box for the customer message thread. Replaces the
// old bare <form action={replyToCustomer}> which wrote into
// portal_messages (the customer-portal chat nobody uses -- Ryan: "no one
// is using" it). This now calls replyToCustomerByEmail (actions.ts),
// which sends a real email, so a send failure (no email on file, Resend
// not configured) needs somewhere inline to show up -- same reasoning
// as AddVisitNoteForm.tsx and ComposeEmailForm.tsx for being a client
// component instead of a plain server-action form.
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function ReplyForm({
  onSubmit,
}: {
  // Already bound to jobberClientId via .bind() in page.tsx -- this
  // component only ever supplies the FormData argument.
  onSubmit: (formData: FormData) => Promise<{ error: string | null }>;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    setSent(false);

    startTransition(async () => {
      const result = await onSubmit(formData);

      if (result.error) {
        setError(result.error);
        return;
      }

      formRef.current?.reset();
      setSent(true);
      router.refresh();
    });
  }

  return (
    <>
      <form ref={formRef} action={handleSubmit} className="mt-4 flex gap-3">
        <textarea
          name="body"
          rows={2}
          required
          placeholder="Type a reply..."
          disabled={isPending}
          className="block w-full rounded-xl border border-[#d8d3c6] bg-white px-4 py-3 text-[#174734] outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={isPending}
          className="shrink-0 rounded-xl bg-[#174734] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#226246] disabled:opacity-60"
        >
          {isPending ? "Sending…" : "Reply"}
        </button>
      </form>
      {error && (
        <p className="mt-2 text-xs font-semibold text-[#991b1b]">{error}</p>
      )}
      {sent && !error && (
        <p className="mt-2 text-xs font-semibold text-green-700">
          Reply sent by email.
        </p>
      )}
    </>
  );
}
