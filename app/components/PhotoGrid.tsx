"use client";

import { useEffect, useState } from "react";

export type GridPhoto = {
  url: string;
  // Raw storage path (e.g. "abc123/photo.jpg"), not the public URL.
  // Required to actually delete the object — the public URL alone
  // doesn't give us that back reliably. Only needed when onRemove is
  // passed; omit it for read-only galleries.
  path?: string;
};

type PhotoGridProps = {
  photos: GridPhoto[];
  alt?: string;
  // Bound server action (see customers/[id]/actions.ts's removeVisitPhoto
  // / removeImportedJobNotePhoto — each already has jobberClientId and
  // noteId baked in via .bind(), so this only ever takes the photoPath).
  // Omit entirely for a read-only gallery with no remove button.
  onRemove?: (photoPath: string) => Promise<{ error: string | null }>;
};

// Renders a grid of photo thumbnails (same 3-per-row look used on the
// Customer page for visit notes and imported Jobber notes) that open into
// a full-screen lightbox instead of a new browser tab. The lightbox has
// Prev/Next arrows scoped to this same set of photos, so browsing a
// visit's photos no longer means close-tab-then-reopen-next for each one.
// When onRemove is provided, the lightbox also gets a Remove button (with
// an inline confirm step) for pulling a single photo that got logged
// against the wrong customer/visit.
export default function PhotoGrid({ photos: initialPhotos, alt = "Turf photo", onRemove }: PhotoGridProps) {
  const [photos, setPhotos] = useState(initialPhotos);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const isOpen = openIndex !== null;

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenIndex(null);
      if (e.key === "ArrowRight") {
        setOpenIndex((i) => (i === null ? i : (i + 1) % photos.length));
      }
      if (e.key === "ArrowLeft") {
        setOpenIndex((i) => (i === null ? i : (i - 1 + photos.length) % photos.length));
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, photos.length]);

  function closeLightbox() {
    setOpenIndex(null);
    setConfirmingRemove(false);
    setRemoveError(null);
  }

  async function handleConfirmRemove() {
    if (openIndex === null || !onRemove) return;

    const target = photos[openIndex];
    if (!target.path) return;

    setRemoving(true);
    setRemoveError(null);

    const result = await onRemove(target.path);

    setRemoving(false);

    if (result.error) {
      setRemoveError(result.error);
      return;
    }

    const next = photos.filter((_, i) => i !== openIndex);
    setPhotos(next);
    setConfirmingRemove(false);

    if (next.length === 0) {
      closeLightbox();
    } else {
      setOpenIndex((i) => (i === null ? i : Math.min(i, next.length - 1)));
    }
  }

  if (photos.length === 0) return null;

  return (
    <>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {photos.map((photo, index) => (
          <button
            key={photo.url}
            type="button"
            onClick={() => setOpenIndex(index)}
            className="block overflow-hidden rounded-lg"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- turf photos live in Supabase Storage, not an optimizable local/remote asset Next's Image config knows about */}
            <img
              src={photo.url}
              alt={alt}
              className="h-20 w-full object-cover transition hover:opacity-90"
            />
          </button>
        ))}
      </div>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={closeLightbox}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              closeLightbox();
            }}
            aria-label="Close"
            className="absolute right-4 top-4 text-3xl font-bold text-white/80 hover:text-white"
          >
            &times;
          </button>

          {photos.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setConfirmingRemove(false);
                setRemoveError(null);
                setOpenIndex((i) =>
                  i === null ? i : (i - 1 + photos.length) % photos.length
                );
              }}
              aria-label="Previous photo"
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 px-4 py-3 text-2xl text-white hover:bg-black/60 sm:left-4"
            >
              &#8249;
            </button>
          )}

          {/* eslint-disable-next-line @next/next/no-img-element -- turf photos live in Supabase Storage, not an optimizable local/remote asset Next's Image config knows about */}
          <img
            src={photos[openIndex].url}
            alt={alt}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
          />

          {photos.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setConfirmingRemove(false);
                setRemoveError(null);
                setOpenIndex((i) => (i === null ? i : (i + 1) % photos.length));
              }}
              aria-label="Next photo"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 px-4 py-3 text-2xl text-white hover:bg-black/60 sm:right-4"
            >
              &#8250;
            </button>
          )}

          <div
            className="absolute bottom-4 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            {photos.length > 1 && (
              <p className="text-sm font-semibold text-white/80">
                {openIndex + 1} of {photos.length}
              </p>
            )}

            {onRemove && photos[openIndex].path && (
              <>
                {confirmingRemove ? (
                  <div className="flex items-center gap-2 rounded-lg bg-white/95 px-3 py-2 text-sm">
                    <span className="font-semibold text-[#174734]">
                      Remove this photo?
                    </span>
                    <button
                      type="button"
                      disabled={removing}
                      onClick={handleConfirmRemove}
                      className="rounded-md bg-red-600 px-2 py-1 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      {removing ? "Removing…" : "Remove"}
                    </button>
                    <button
                      type="button"
                      disabled={removing}
                      onClick={() => setConfirmingRemove(false)}
                      className="rounded-md border border-[#d9d4c6] px-2 py-1 text-xs font-semibold text-[#6b705c] hover:bg-[#f7f6f1]"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmingRemove(true)}
                    className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/20"
                  >
                    Remove photo (wrong customer?)
                  </button>
                )}

                {removeError && (
                  <p className="rounded-md bg-red-100 px-2 py-1 text-xs text-red-700">
                    {removeError}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
