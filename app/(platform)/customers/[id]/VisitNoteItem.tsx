"use client";

// Admin-only edit/delete for a single visit note (Ryan's request, after
// a note saved without photos and the follow-up "just add the photos"
// attempt landed on the wrong visit entirely -- see AddVisitNoteForm.tsx's
// own fix for the root cause, and lib/visitNotes.ts's updateVisitNote/
// deleteVisitNote for why edit only ever ADDS photos rather than
// replacing the set: removing a specific wrong photo already has its own
// button via PhotoGrid's onRemove, so edit mode doesn't need to duplicate
// that).
import { useState, useTransition } from "react";
import PhotoGrid from "@/app/components/PhotoGrid";
import { uploadVisitPhotosFromBrowser } from "@/lib/uploadVisitPhotosClient";

type VisitNoteItemProps = {
  jobberVisitId: string;
  note: string | null;
  photoUrls: string[];
  photoPaths: string[];
  authorName: string | null;
  createdAtLabel: string;
  canManage: boolean;
  onRemovePhoto: (photoPath: string) => Promise<{ error: string | null }>;
  // Both already bound with (jobberClientId, noteId) via .bind() in
  // page.tsx -- this component only ever supplies the arguments below.
  onUpdate: (formData: FormData) => Promise<{ error: string | null }>;
  onDelete: () => Promise<{ error: string | null }>;
};

export default function VisitNoteItem({
  jobberVisitId,
  note,
  photoUrls,
  photoPaths,
  authorName,
  createdAtLabel,
  canManage,
  onRemovePhoto,
  onUpdate,
  onDelete,
}: VisitNoteItemProps) {
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);

  if (deleted) return null;

  function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

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
          files.length === 1 ? "Uploading photo…" : `Uploading ${files.length} photos…`
        );

        const upload = await uploadVisitPhotosFromBrowser(jobberVisitId, files);
        setUploadStatus(null);

        if (upload.paths.length === 0 && upload.error) {
          setError(`Photo upload failed: ${upload.error}`);
          return;
        }

        formData.set("photo_paths", JSON.stringify(upload.paths));
      }

      const result = await onUpdate(formData);

      if (result.error) {
        setError(result.error);
        return;
      }

      setEditing(false);
    });
  }

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const result = await onDelete();

      if (result.error) {
        setError(result.error);
        return;
      }

      setDeleted(true);
    });
  }

  return (
    <div className="rounded-xl bg-[#f7f6f1] px-3 py-2">
      {editing ? (
        <form onSubmit={handleSave} className="space-y-2">
          <textarea
            name="note"
            rows={2}
            defaultValue={note ?? ""}
            placeholder="What did you notice?"
            className="w-full rounded-lg border border-[#d9d4c6] bg-white px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
          />

          <div>
            <p className="text-[10px] font-semibold text-[#9c7a20]">
              Add more photos (existing photos are removed individually below, not here)
            </p>
            <input
              type="file"
              name="photos"
              accept="image/*"
              multiple
              className="mt-1 w-full text-xs text-[#6b705c] file:mr-3 file:rounded-lg file:border-0 file:bg-[#174734] file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-white"
            />
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isPending}
              className="rounded-lg bg-[#174734] px-3 py-1.5 text-xs font-bold text-white transition hover:bg-[#226246] disabled:opacity-60"
            >
              {uploadStatus ?? (isPending ? "Saving…" : "Save")}
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => {
                setEditing(false);
                setError(null);
              }}
              className="rounded-lg border border-[#d9d4c6] px-3 py-1.5 text-xs font-semibold text-[#6b705c] hover:bg-white"
            >
              Cancel
            </button>
          </div>

          {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
        </form>
      ) : (
        <>
          {note && <p className="text-sm text-[#174734]">{note}</p>}

          <PhotoGrid
            photos={photoUrls.map((url, i) => ({ url, path: photoPaths[i] }))}
            onRemove={onRemovePhoto}
          />

          <div className="mt-1 flex items-center justify-between gap-2">
            <p className="text-[10px] text-[#9c7a20]">
              {authorName ?? "Unknown"} · {createdAtLabel}
            </p>

            {canManage && (
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="text-[10px] font-bold text-[#174734] underline"
                >
                  Edit
                </button>
                {confirmingDelete ? (
                  <span className="flex items-center gap-1 text-[10px]">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={handleDelete}
                      className="font-bold text-red-600 underline disabled:opacity-50"
                    >
                      {isPending ? "Deleting…" : "Confirm delete"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingDelete(false)}
                      className="font-semibold text-[#6b705c] underline"
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(true)}
                    className="text-[10px] font-bold text-red-600 underline"
                  >
                    Delete
                  </button>
                )}
              </div>
            )}
          </div>

          {error && <p className="mt-1 text-xs font-semibold text-red-600">{error}</p>}
        </>
      )}
    </div>
  );
}
