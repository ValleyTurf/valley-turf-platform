"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/currentUser";
import { featurePhoto, unfeaturePhoto } from "@/lib/featuredGalleryPhotos";

export async function featurePhotoAction(
  jobberClientId: string,
  jobberVisitId: string,
  photoPath: string
): Promise<{ error: string | null }> {
  const actor = await getCurrentUser();

  if (!actor) {
    return { error: "You must be signed in." };
  }

  const result = await featurePhoto(
    jobberClientId,
    jobberVisitId,
    photoPath,
    actor.id
  );

  if (result.error) {
    return result;
  }

  revalidatePath("/gallery");

  return { error: null };
}

export async function unfeaturePhotoAction(
  photoPath: string
): Promise<{ error: string | null }> {
  const actor = await getCurrentUser();

  if (!actor) {
    return { error: "You must be signed in." };
  }

  const result = await unfeaturePhoto(photoPath);

  if (result.error) {
    return result;
  }

  revalidatePath("/gallery");

  return { error: null };
}
