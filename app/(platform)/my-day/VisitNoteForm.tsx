"use client";

// Client component for two reasons: (1) a failed save needs somewhere to
// show up — a plain <form action> version of this swallowed failures into
// a server-only console.error, which from the field looked exactly like
// tapping "Save Note" did nothing; (2) photos have to be uploaded
// directly from the browser to Supabase Storage
// (uploadVisitPhotosFromBrowser) BEFORE calling addVisitNoteFromMyDay —
// routing the raw file bytes through that action would hit Vercel's
// ~4.5MB Serverless Function body cap, which a single real phone photo
// can exceed on its own. See lib/visitPhotoUploadAction.ts for the full
// story. Also deliberately has NO capture="environment" on the file
// input — that hint forces the camera open on several mobile browsers
// and hides the option to pick an existing photo from the library.
import { useRef, useState, useTransition } from "react";
import { addVisitNoteFromMyDay } from "./actions";
import { uploadVisitPhotosFromBrowser } from "@/lib/uploadVisitPhotosClient";

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

    const fileInput = form.elements.namedItem("photos");
    const files =
      fileInput instanceof HTMLInputElement && fileInput.files
        ? Array.from(fileInput.files)
        : [];

    formData.delete("photos");

    startTransition(async () => {
      if (files.length > 0) {
        setUploadStatus(
          files.length === 1
            ? "Uploading photo…"
            : `Uploading ${files.length} photos…`
        );

        const upload = await uploadVisitPhotosFromBrowser(visitId, files);

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
    <form ref={formRef} onSubmit={handleSubmit} className="mt-2 space-y-2">
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
        {uploadStatus ?? (isPending ? "Saving…" : "Save Note")}
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
