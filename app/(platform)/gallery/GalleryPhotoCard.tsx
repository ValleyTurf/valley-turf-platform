"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { featurePhotoAction, unfeaturePhotoAction } from "./actions";

export type GalleryPhoto = {
  jobberClientId: string;
  customerName: string;
  jobberVisitId: string;
  photoPath: string;
  photoUrl: string;
  createdAt: string;
  featured: boolean;
};

// Plain <img>, not next/image -- same reasoning as
// app/components/PhotoGrid.tsx: these live in Supabase Storage, not an
// optimizable local/remote asset Next's Image config knows about, and
// this way no next.config.ts change is needed to render them.
export default function GalleryPhotoCard({ photo }: { photo: GalleryPhoto }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleToggle() {
    setError(null);

    startTransition(async () => {
      const result = photo.featured
        ? await unfeaturePhotoAction(photo.photoPath)
        : await featurePhotoAction(
            photo.jobberClientId,
            photo.jobberVisitId,
            photo.photoPath
          );

      if (result.error) {
        setError(result.error);
        return;
      }

      router.refresh();
    });
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[#e7e2d5] bg-white">
      {/* eslint-disable-next-line @next/next/no-img-element -- turf photos live in Supabase Storage, not an optimizable local/remote asset Next's Image config knows about */}
      <img
        src={photo.photoUrl}
        alt={`Turf photo for ${photo.customerName}`}
        className="h-32 w-full object-cover"
      />

      <div className="p-2">
        <p className="truncate text-xs font-bold">{photo.customerName}</p>

        {error && (
          <p className="text-[10px] font-semibold text-[#991b1b]">{error}</p>
        )}

        <button
          type="button"
          onClick={handleToggle}
          disabled={isPending}
          className={`mt-1 w-full rounded-lg px-2 py-1 text-[11px] font-bold transition disabled:opacity-60 ${
            photo.featured
              ? "border border-[#d9d4c6] text-[#6b705c] hover:bg-[#f7f6f1]"
              : "bg-[#174734] text-white hover:bg-[#226246]"
          }`}
        >
          {isPending
            ? "…"
            : photo.featured
              ? "Un-feature"
              : "Feature on Website"}
        </button>
      </div>
    </div>
  );
}
