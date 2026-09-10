"use client";

// Reply box for the customer message thread -- now with an Email/Text
// toggle (Ryan's request: "I can email people, but not text message").
// Defaults to Email since that's the original behavior and every inbound
// thread here started as an email reply; Text becomes the obvious choice
// once a customer's been texting in instead. Whichever is selected picks
// which of the two bound server actions (page.tsx passes both) actually
// gets called -- same onSubmit shape either way, so this component
// doesn't need to know anything about how each channel sends.
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type ReplyChannel = "email" | "sms";

export function ReplyForm({
  onSubmitEmail,
  onSubmitSms,
}: {
  // Both already bound to jobberClientId via .bind() in page.tsx -- this
  // component only ever supplies the FormData argument.
  onSubmitEmail: (formData: FormData) => Promise<{ error: string | null }>;
  onSubmitSms: (formData: FormData) => Promise<{ error: string | null }>;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [channel, setChannel] = useState<ReplyChannel>("email");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<ReplyChannel | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    setSent(null);

    const submit = channel === "email" ? onSubmitEmail : onSubmitSms;

    startTransition(async () => {
      const result = await submit(formData);

      if (result.error) {
        setError(result.error);
        return;
      }

      formRef.current?.reset();
      setSent(channel);
      router.refresh();
    });
  }

  return (
    <>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => setChannel("email")}
          disabled={isPending}
          className={`rounded-full border px-3 py-1 text-xs font-bold transition ${
            channel === "email"
              ? "border-[#174734] bg-[#174734] text-white"
              : "border-[#d8d3c6] text-[#174734] hover:border-[#9c7a20]"
          }`}
        >
          ✉️ Email
        </button>
        <button
          type="button"
          onClick={() => setChannel("sms")}
          disabled={isPending}
          className={`rounded-full border px-3 py-1 text-xs font-bold transition ${
            channel === "sms"
              ? "border-[#174734] bg-[#174734] text-white"
              : "border-[#d8d3c6] text-[#174734] hover:border-[#9c7a20]"
          }`}
        >
          💬 Text
        </button>
      </div>

      <form ref={formRef} action={handleSubmit} className="mt-2 flex gap-3">
        <textarea
          name="body"
          rows={2}
          required
          placeholder={channel === "email" ? "Type a reply..." : "Type a text..."}
          disabled={isPending}
          className="block w-full rounded-xl border border-[#d8d3c6] bg-white px-4 py-3 text-[#174734] outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={isPending}
          className="shrink-0 rounded-xl bg-[#174734] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#226246] disabled:opacity-60"
        >
          {isPending ? "Sending…" : channel === "email" ? "Reply" : "Text"}
        </button>
      </form>
      {error && (
        <p className="mt-2 text-xs font-semibold text-[#991b1b]">{error}</p>
      )}
      {sent && !error && (
        <p className="mt-2 text-xs font-semibold text-green-700">
          Reply sent by {sent === "email" ? "email" : "text"}.
        </p>
      )}
    </>
  );
}
