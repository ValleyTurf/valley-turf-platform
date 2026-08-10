"use client";

import { useEffect, useState } from "react";

type PhotoGridProps = {
  photos: string[];
  alt?: string;
};

// Renders a grid of photo thumbnails (same 3-per-row look used on the
// Customer page for visit notes and imported Jobber notes) that open into
// a full-screen lightbox instead of a new browser tab. The lightbox has
// Prev/Next arrows scoped to this same set of photos, so browsing a
// visit's photos no longer means close-tab-then-reopen-next for each one.
export default function PhotoGrid({ photos, alt = "Turf photo" }: PhotoGridProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

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

  if (photos.length === 0) return null;

  return (
    <>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {photos.map((url, index) => (
          <button
            key={url}
            type="button"
            onClick={() => setOpenIndex(index)}
            className="block overflow-hidden rounded-lg"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- turf photos live in Supabase Storage, not an optimizable local/remote asset Next's Image config knows about */}
            <img
              src={url}
              alt={alt}
              className="h-20 w-full object-cover transition hover:opacity-90"
            />
          </button>
        ))}
      </div>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setOpenIndex(null)}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOpenIndex(null);
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
            src={photos[openIndex]}
            alt={alt}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
          />

          {photos.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setOpenIndex((i) => (i === null ? i : (i + 1) % photos.length));
              }}
              aria-label="Next photo"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 px-4 py-3 text-2xl text-white hover:bg-black/60 sm:right-4"
            >
              &#8250;
            </button>
          )}

          {photos.length > 1 && (
            <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-sm font-semibold text-white/80">
              {openIndex + 1} of {photos.length}
            </p>
          )}
        </div>
      )}
    </>
  );
}
