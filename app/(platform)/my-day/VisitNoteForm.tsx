"use client";

// Client component for the same reason AddVisitNoteForm.tsx on the
// customer page is one: a plain <form action> here swallowed failures
// into a server-only console.error, which from the field looked exactly
// like tapping "Save Note" did nothing. Also deliberately has NO
// capture="environment" on the file input — an earlier version set that
// to hint the OS toward the camera, but on several mobile browsers it
// forces the camera and hides the option to pick an existing photo from
// the library entirely. Plain accept="image/*" still lets the OS offer
// "Take Photo" as one of the choices without removing the others.
import { useRef, useState, useTransition } from "react";
import { addVisitNoteFromMyDay } from "./actions";

export default function VisitNoteForm({
  visitId,
  clientId,
}: {
  visitId: string;
  clientId: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(false);

    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await addVisitNoteFromMyDay(visitId, clientId, formData);

      if (result.error) {
        setError(result.error);
        return;
      }

      formRef.current?.reset();
      setSaved(true);
    });
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="mt-2 space-y-2"
    >
      <textarea
        name="note"
        rows={2}
        placeholder="Brown patches, sprinkler issue, gate was locked, etc."
        className="w-full rounded-lg border border-[#174734]/20 px-2 py-1.5 text-sm"
      />

      <input
        type="file"
        name="photos"
        accept="image/*"
        multiple
        className="w-full text-xs text-[#174734] file:mr-2 file:rounded-lg file:border-0 file:bg-[#174734] file:px-2 file:py-1 file:text-xs file:font-bold file:text-white"
      />

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-lg border border-[#174734] px-3 py-1.5 text-xs font-bold text-[#174734] transition hover:bg-white disabled:opacity-60"
      >
        {isPending ? "Saving…" : "Save Note"}
      </button>

      {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
      {saved && !error && (
        <p className="text-xs font-semibold text-green-700">Note saved.</p>
      )}
    </form>
  );
}
