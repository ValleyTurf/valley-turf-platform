"use client";

// Client component for two reasons: (1) a failed save needs somewhere to
// show up — a plain <form action> version of this called a server action
// that only console.error'd on failure, which looked exactly like "I
// click Add Note and nothing happens"; (2) photos have to be uploaded
// directly from the browser to Supabase Storage (uploadVisitPhotosFromBrowser)
// BEFORE calling addVisitNote — routing the raw file bytes through
// addVisitNote itself would hit Vercel's ~4.5MB Serverless Function body
// cap, which a single real phone photo can exceed on its own. See
// lib/visitPhotoUploadAction.ts for the full story.
import { useRef, useState, useTransition } from "react";
import { addVisitNote } from "./actions";
import { uploadVisitPhotosFromBrowser } from "@/lib/uploadVisitPhotosClient";

// label is pre-formatted server-side (page.tsx) rather than passed as a
// raw date + a formatting function — a plain function can't cross the
// Server-to-Client Component boundary (only data and Server Actions
// can), so an earlier version of this that took a formatVisitDateTime
// function prop threw on every render and broke the whole page.
type NoteableVisit = {
  jobber_visit_id: string;
  label: string;
};

export default function AddVisitNoteForm({
  jobberClientId,
  noteableVisits,
}: {
  jobberClientId: string;
  noteableVisits: NoteableVisit[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setWarning(null);
    setSaved(false);

    const form = event.currentTarget;
    const formData = new FormData(form);
    const jobberVisitId = formData.get("jobber_visit_id");

    const fileInput = form.elements.namedItem("photos");
    const files =
      fileInput instanceof HTMLInputElement && fileInput.files
        ? Array.from(fileInput.files)
        : [];

    // The raw files never get sent to addVisitNote — only the storage
    // paths they upload to, appended below once the upload finishes.
    formData.delete("photos");

    startTransition(async () => {
      if (files.length > 0 && typeof jobberVisitId === "string" && jobberVisitId) {
        setUploadStatus(
          files.length === 1
            ? "Uploading photo…"
            : `Uploading ${files.length} photos…`
        );

        const upload = await uploadVisitPhotosFromBrowser(jobberVisitId, files);

        setUploadStatus(null);

        if (upload.paths.length === 0 && upload.error) {
          setError(`Photo upload failed: ${upload.error}`);
          return;
        }

        formData.set("photo_paths", JSON.stringify(upload.paths));

        if (upload.error) {
          setWarning(
            `${upload.paths.length} of ${files.length} photo(s) uploaded — the rest failed: ${upload.error}`
          );
        }
      }

      const result = await addVisitNote(jobberClientId, formData);

      if (result.error) {
        setError(result.error);
        return;
      }

      formRef.current?.reset();
      setSaved(true);
    });
  }

  if (noteableVisits.length === 0) {
    return (
      <p className="mt-2 rounded-xl bg-[#f7f6f1] px-3 py-2 text-sm text-[#6b705c]">
        No visits to attach a note to yet.
      </p>
    );
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="mt-2 space-y-2">
      <select
        name="jobber_visit_id"
        required
        defaultValue={noteableVisits[0]?.jobber_visit_id}
        className="w-full rounded-lg border border-[#d9d4c6] bg-white px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
      >
        {noteableVisits.map((visit) => (
          <option key={visit.jobber_visit_id} value={visit.jobber_visit_id}>
            {visit.label}
          </option>
        ))}
      </select>

      <textarea
        name="note"
        rows={2}
        placeholder="What did you notice? (brown patches, sprinkler issue, dog got out, etc.)"
        className="w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
      />

      <input
        type="file"
        name="photos"
        accept="image/*"
        multiple
        className="w-full text-xs text-[#6b705c] file:mr-3 file:rounded-lg file:border-0 file:bg-[#174734] file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-white"
      />

      <button
        type="submit"
        disabled={isPending}
        className="rounded-lg bg-[#174734] px-3 py-1.5 text-xs font-bold text-white transition hover:bg-[#226246] disabled:opacity-60"
      >
        {uploadStatus ?? (isPending ? "Saving…" : "Add Note")}
      </button>

      {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
      {warning && !error && (
        <p className="text-xs font-semibold text-amber-700">{warning}</p>
      )}
      {saved && !error && (
        <p className="text-xs font-semibold text-green-700">Note saved.</p>
      )}
    </form>
  );
}
