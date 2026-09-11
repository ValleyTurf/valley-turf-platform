// ROADMAP.md Fresh Ideas #6 -- photo-based before/after gallery sourced
// from real visit photos instead of hand-picked stock-style images. See
// migration 073_add_gallery_consent_and_featured_photos.sql.
//
// Photos themselves already exist in visit_notes.photo_paths (captured
// via My Day / the customer page, see lib/visitNotes.ts) -- this file
// only adds "which of those, for customers who said it's OK, are curated
// for the website," via a small join table (featured_gallery_photos)
// that references existing photo_paths rather than duplicating any photo
// data.
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
import { visitNotePhotoUrl } from "@/lib/visitNotes";

// Pragmatic cap on how many photos the curation page loads at once --
// same "don't paginate a rarely-large list" reasoning as
// lib/recurringRevenue.ts's monthsBack=12 default. A small business
// generating this many *unfeatured* candidate photos between curation
// sessions is already more than Ryan needs to look through in one sitting.
const CURATION_PHOTO_LIMIT = 200;
const CURATION_NOTES_FETCH_LIMIT = 500;

export type ConsentingCustomerPhoto = {
  jobberClientId: string;
  customerName: string;
  jobberVisitId: string;
  photoPath: string;
  photoUrl: string;
  createdAt: string;
  featured: boolean;
};

type ConsentingCustomerRow = {
  jobber_client_id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
};

type VisitNotePhotoRow = {
  jobber_visit_id: string;
  jobber_client_id: string;
  photo_paths: string[] | null;
  created_at: string;
};

// For the internal curation page (app/(platform)/gallery) -- every photo
// belonging to a customer who has said yes, most recent first, flagged
// with whether it's already featured.
export async function getConsentingCustomerPhotos(): Promise<
  ConsentingCustomerPhoto[]
> {
  const { data: consentingCustomers, error: customersError } =
    await supabaseServer
      .from("customers")
      .select("jobber_client_id, full_name, first_name, last_name, company_name")
      .eq("gallery_consent", true);

  if (
    customersError ||
    !consentingCustomers ||
    consentingCustomers.length === 0
  ) {
    return [];
  }

  const nameById = new Map<string, string>();
  const consentingIds: string[] = [];

  for (const customer of consentingCustomers as ConsentingCustomerRow[]) {
    consentingIds.push(customer.jobber_client_id);
    nameById.set(
      customer.jobber_client_id,
      customer.full_name ||
        [customer.first_name, customer.last_name].filter(Boolean).join(" ") ||
        customer.company_name ||
        "Customer"
    );
  }

  const { data: notesData, error: notesError } = await supabaseServer
    .from("visit_notes")
    .select("jobber_visit_id, jobber_client_id, photo_paths, created_at")
    .in("jobber_client_id", consentingIds)
    .order("created_at", { ascending: false })
    .limit(CURATION_NOTES_FETCH_LIMIT);

  if (notesError || !notesData) return [];

  const { data: featuredData } = await supabaseServer
    .from("featured_gallery_photos")
    .select("photo_path");

  const featuredPaths = new Set(
    ((featuredData ?? []) as { photo_path: string }[]).map((r) => r.photo_path)
  );

  const photos: ConsentingCustomerPhoto[] = [];

  for (const note of notesData as VisitNotePhotoRow[]) {
    for (const path of note.photo_paths ?? []) {
      photos.push({
        jobberClientId: note.jobber_client_id,
        customerName: nameById.get(note.jobber_client_id) ?? "Customer",
        jobberVisitId: note.jobber_visit_id,
        photoPath: path,
        photoUrl: visitNotePhotoUrl(path),
        createdAt: note.created_at,
        featured: featuredPaths.has(path),
      });

      if (photos.length >= CURATION_PHOTO_LIMIT) {
        return photos;
      }
    }
  }

  return photos;
}

// Duplicate feature (double click, two tabs) hits the unique(photo_path)
// constraint -- treated as a no-op success rather than surfaced as an
// error, since the end state Ryan wants ("this photo is featured") is
// already true either way.
export async function featurePhoto(
  jobberClientId: string,
  jobberVisitId: string,
  photoPath: string,
  actorUserId: string | null
): Promise<{ error: string | null }> {
  const { error } = await supabaseServer.from("featured_gallery_photos").insert({
    jobber_client_id: jobberClientId,
    jobber_visit_id: jobberVisitId,
    photo_path: photoPath,
    featured_by_user_id: actorUserId,
  });

  if (error && !error.message.toLowerCase().includes("duplicate")) {
    return { error: error.message };
  }

  return { error: null };
}

export async function unfeaturePhoto(
  photoPath: string
): Promise<{ error: string | null }> {
  const { error } = await supabaseServer
    .from("featured_gallery_photos")
    .delete()
    .eq("photo_path", photoPath);

  return { error: error?.message ?? null };
}

export type FeaturedSitePhoto = { url: string; alt: string };

type FeaturedGalleryPhotoRow = {
  jobber_client_id: string;
  photo_path: string;
  created_at: string;
};

// For the public marketing site (app/site/page.tsx). Re-checks
// customers.gallery_consent = true at query time rather than trusting it
// was still true when the photo was featured -- so if a customer later
// revokes consent, their photos drop off the live site on the very next
// page load with no manual cleanup step required.
export async function getFeaturedGalleryPhotos(
  limit = 12
): Promise<FeaturedSitePhoto[]> {
  const { data: featuredData, error: featuredError } = await supabaseServer
    .from("featured_gallery_photos")
    .select("jobber_client_id, photo_path, created_at")
    .order("created_at", { ascending: false })
    // Fetch extra headroom beyond `limit` -- some may get filtered out
    // below if consent was revoked since the photo was featured.
    .limit(limit * 3);

  if (featuredError || !featuredData || featuredData.length === 0) {
    return [];
  }

  const rows = featuredData as FeaturedGalleryPhotoRow[];
  const clientIds = Array.from(new Set(rows.map((r) => r.jobber_client_id)));

  const { data: consentData } = await supabaseServer
    .from("customers")
    .select("jobber_client_id")
    .eq("gallery_consent", true)
    .in("jobber_client_id", clientIds);

  const consentingIds = new Set(
    ((consentData ?? []) as { jobber_client_id: string }[]).map(
      (r) => r.jobber_client_id
    )
  );

  return rows
    .filter((row) => consentingIds.has(row.jobber_client_id))
    .slice(0, limit)
    .map((row) => ({
      url: visitNotePhotoUrl(row.photo_path),
      alt: "Artificial turf cleaned by Valley Turf Revival",
    }));
}
